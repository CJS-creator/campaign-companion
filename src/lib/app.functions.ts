import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Campaign, EventRow, Lead, Send } from "./types";

/** All data access runs server-side with the owner session enforced. */
async function guard() {
  const { assertOwner } = await import("./owner-guard.server");
  assertOwner();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

async function audit(action: string, details: Record<string, JsonValue>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({ action, details });
}

export const LEADS_PAGE_SIZE = 25;

const leadSortSchema = z.enum(["created_desc", "email_asc", "email_desc", "name_asc", "name_desc"]);
export type LeadSort = z.infer<typeof leadSortSchema>;

const sortColumns: Record<LeadSort, { column: string; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  email_asc: { column: "email", ascending: true },
  email_desc: { column: "email", ascending: false },
  name_asc: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
};

function escapeSearch(value: string) {
  return value.trim().replace(/[%,()]/g, "\\$&");
}

/* ------------------------------- session -------------------------------- */

export const getSessionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { isOwnerRequest } = await import("./owner-guard.server");
  return { authenticated: isOwnerRequest() };
});

/* --------------------------------- leads -------------------------------- */

export const fetchLeadsPage = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z
      .object({
        search: z.string().default(""),
        sort: leadSortSchema,
        page: z.number().int().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ leads: Lead[]; count: number }> => {
    const db = await guard();
    const search = escapeSearch(data.search);
    const { column, ascending } = sortColumns[data.sort];
    let query = db.from("leads").select("*", { count: "exact" });
    if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    const {
      data: rows,
      error,
      count,
    } = await query
      .order(column, { ascending, nullsFirst: false })
      .range(data.page * LEADS_PAGE_SIZE, (data.page + 1) * LEADS_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { leads: (rows ?? []) as Lead[], count: count ?? 0 };
  });

export const fetchLeads = createServerFn({ method: "GET" })
  .inputValidator(
    (data: unknown) =>
      z
        .object({ search: z.string().default("") })
        .optional()
        .parse(data) ?? { search: "" },
  )
  .handler(async ({ data }): Promise<Lead[]> => {
    const db = await guard();
    const search = escapeSearch(data.search ?? "");
    let query = db.from("leads").select("*").order("created_at", { ascending: false });
    if (search) query = query.or(`email.ilike.%${search}%,name.ilike.%${search}%`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Lead[];
  });

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        name: z.string().trim().max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const email = data.email.toLowerCase();
    const now = new Date().toISOString();
    const { error } = await db.from("leads").insert({
      email,
      name: data.name || null,
      consent_source: "manual",
      consent_date: now,
      consent_note: "Added manually by the owner",
    });
    if (error)
      throw new Error(
        error.code === "23505" ? "That email is already on the list." : error.message,
      );
    await audit("lead_added", { email, source: "manual" });
    return { ok: true };
  });

export const setLeadSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(5000), subscribed: z.boolean() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db
      .from("leads")
      .update({
        subscribed: data.subscribed,
        suppression_status: data.subscribed ? "active" : "unsubscribed",
        suppression_reason: data.subscribed ? null : "Owner action",
        suppressed_at: data.subscribed ? null : new Date().toISOString(),
      })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await audit(data.subscribed ? "lead_resubscribed" : "lead_unsubscribed", {
      count: data.ids.length,
    });
    return { ok: true, count: data.ids.length };
  });

export const deleteLeads = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }).parse(data),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { error } = await db.from("leads").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    await audit("lead_deleted", { count: data.ids.length });
    return { ok: true, count: data.ids.length };
  });

export type LeadImportPreviewResult = {
  totalRows: number;
  newLeads: Array<{ email: string; name: string | null }>;
  dbDuplicates: Array<{ email: string; name: string | null; existingName?: string | null }>;
  fileDuplicates: Array<{ email: string; name: string | null; firstRow: number }>;
  invalidRows: Array<{ row: number; email: string; reason: string }>;
};

export const previewLeadImport = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        rows: z
          .array(z.object({ email: z.string(), name: z.string().nullable().optional() }))
          .min(1)
          .max(20000),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<LeadImportPreviewResult> => {
    const db = await guard();
    const emailSchema = z.string().trim().email().max(255);

    const validRows: Array<{ rowNum: number; email: string; name: string | null }> = [];
    const invalidRows: LeadImportPreviewResult["invalidRows"] = [];
    const seenEmails = new Map<string, number>();
    const fileDuplicates: LeadImportPreviewResult["fileDuplicates"] = [];

    data.rows.forEach((r, idx) => {
      const rowNum = idx + 2;
      const cleanEmail = (r.email || "").trim().toLowerCase();
      const cleanName = r.name ? r.name.trim().slice(0, 100) : null;

      if (!cleanEmail) {
        invalidRows.push({ row: rowNum, email: r.email || "", reason: "Missing email address" });
        return;
      }

      const parsed = emailSchema.safeParse(cleanEmail);
      if (!parsed.success) {
        invalidRows.push({ row: rowNum, email: cleanEmail, reason: "Invalid email format" });
        return;
      }

      if (seenEmails.has(cleanEmail)) {
        fileDuplicates.push({
          email: cleanEmail,
          name: cleanName,
          firstRow: seenEmails.get(cleanEmail)!,
        });
        return;
      }

      seenEmails.set(cleanEmail, rowNum);
      validRows.push({ rowNum, email: cleanEmail, name: cleanName });
    });

    const emailsToCheck = validRows.map((r) => r.email);
    const existingMap = new Map<string, { name: string | null }>();

    for (let i = 0; i < emailsToCheck.length; i += 500) {
      const chunk = emailsToCheck.slice(i, i + 500);
      const { data: existing, error } = await db
        .from("leads")
        .select("email, name")
        .in("email", chunk);
      if (error) throw new Error(error.message);
      for (const item of existing ?? []) {
        existingMap.set(item.email.toLowerCase(), { name: item.name });
      }
    }

    const newLeads: LeadImportPreviewResult["newLeads"] = [];
    const dbDuplicates: LeadImportPreviewResult["dbDuplicates"] = [];

    validRows.forEach((r) => {
      if (existingMap.has(r.email)) {
        dbDuplicates.push({
          email: r.email,
          name: r.name,
          existingName: existingMap.get(r.email)?.name ?? null,
        });
      } else {
        newLeads.push({ email: r.email, name: r.name });
      }
    });

    return {
      totalRows: data.rows.length,
      newLeads,
      dbDuplicates,
      fileDuplicates,
      invalidRows,
    };
  });

export const importLeads = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              email: z.string().trim().email().max(255),
              name: z.string().trim().max(100).nullable(),
            }),
          )
          .min(1)
          .max(20000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const rows = data.rows.map((row) => ({
      email: row.email.toLowerCase(),
      name: row.name || null,
    }));
    const emails = rows.map((r) => r.email);

    const known = new Set<string>();
    for (let i = 0; i < emails.length; i += 500) {
      const { data: existing, error } = await db
        .from("leads")
        .select("email")
        .in("email", emails.slice(i, i + 500));
      if (error) throw new Error(error.message);
      for (const row of existing ?? []) known.add(row.email);
    }

    const fresh = rows.filter((r) => !known.has(r.email));
    const importedAt = new Date().toISOString();
    let added = 0;
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200).map((row) => ({
        ...row,
        consent_source: "import",
        consent_date: importedAt,
        consent_note: `Bulk spreadsheet import on ${importedAt}`,
      }));
      const { error } = await db.from("leads").insert(chunk);
      if (error) throw new Error(error.message);
      added += chunk.length;
    }
    await audit("leads_imported", { added, duplicates: rows.length - fresh.length });
    return { added, duplicates: rows.length - fresh.length };
  });

/* ------------------------------- campaigns ------------------------------ */

export const fetchCampaigns = createServerFn({ method: "GET" }).handler(
  async (): Promise<Campaign[]> => {
    const db = await guard();
    const { data, error } = await db
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Campaign[];
  },
);

export const fetchCampaign = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<Campaign | null> => {
    const db = await guard();
    const { data: row, error } = await db
      .from("campaigns")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as Campaign | null) ?? null;
  });

export const fetchSends = createServerFn({ method: "GET" }).handler(async (): Promise<Send[]> => {
  const db = await guard();
  const { data, error } = await db.from("sends").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as Send[];
});

export const createCampaign = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        subject: z.string().trim().min(1).max(200),
        bodyHtml: z.string().min(1).max(200000),
        offerUrl: z.string().trim().max(2000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const plainText = data.bodyHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const { data: row, error } = await db
      .from("campaigns")
      .insert({
        subject: data.subject,
        body_html: data.bodyHtml,
        body_text: plainText,
        offer_url: data.offerUrl || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit("campaign_created", { campaign_id: row.id, subject: data.subject });
    return { id: row.id as string };
  });

/* --------------------------------- events -------------------------------- */

const eventFilters = z.object({
  types: z.array(z.string()).default([]),
  campaignId: z.string().uuid().nullable().default(null),
  search: z.string().default(""),
  from: z.string().nullable().default(null),
  to: z.string().nullable().default(null),
  limit: z.number().int().min(1).max(5000).default(500),
});

export const fetchEvents = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => eventFilters.parse(data ?? {}))
  .handler(async ({ data }): Promise<EventRow[]> => {
    const db = await guard();
    let query = db
      .from("events")
      .select(
        "id, event_type, reason, created_at, send_id, campaign_id, lead_id, leads(email), campaigns(subject)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.types.length > 0) query = query.in("event_type", data.types);
    if (data.campaignId) query = query.eq("campaign_id", data.campaignId);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const search = data.search.trim().toLowerCase();
    return (
      (rows ?? []) as unknown as Array<
        Omit<EventRow, "lead_email" | "campaign_subject"> & {
          leads: { email: string } | null;
          campaigns: { subject: string } | null;
        }
      >
    )
      .map((row) => ({
        id: row.id,
        event_type: row.event_type,
        reason: row.reason,
        created_at: row.created_at,
        send_id: row.send_id,
        campaign_id: row.campaign_id,
        lead_id: row.lead_id,
        lead_email: row.leads?.email ?? null,
        campaign_subject: row.campaigns?.subject ?? null,
      }))
      .filter((row) =>
        search
          ? (row.lead_email ?? "").toLowerCase().includes(search) ||
            (row.campaign_subject ?? "").toLowerCase().includes(search)
          : true,
      );
  });

export const fetchAuditLogs = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(1000).default(200) }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const db = await guard();
    const { data: rows, error } = await db
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      action: string;
      details: JsonValue;
      created_at: string;
    }>;
  });
