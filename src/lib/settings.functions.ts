import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isVerifiedSenderAddress, validateSenderAddress } from "./sender";
import type { ResendDomainStatus, SenderBlockReason } from "./resend-domains.server";


export interface OwnerSettings {
  id: string;
  business_name: string;
  postal_address: string;
  support_email: string;
  sender_domain: string;
  from_address: string;
  daily_cap: number;
  monthly_cap: number;
  timezone: string;
  throttle_pause_ms: number;
  enforce_caps: boolean;
  require_link_check: boolean;
  block_url_shorteners: boolean;
  auto_suppress_bounces: boolean;
  updated_at: string;
}

const updateSettingsInput = z.object({
  business_name: z.string().trim().min(1, "Business name is required").max(120),
  postal_address: z.string().trim().min(5, "Postal address is required").max(300),
  support_email: z.string().trim().email("Valid support email required").max(255),
  sender_domain: z.string().trim().min(3, "Sender domain required").max(255),
  from_address: z
    .string()
    .trim()
    .max(255)
    .refine(
      (value) => value === "" || validateSenderAddress(value).isValid,
      (value) => ({
        message:
          validateSenderAddress(value).message ||
          "Enter a valid sender address on your verified domain (shared @resend.dev is not allowed).",
      }),
    ),
  daily_cap: z.number().int().min(1).max(100000),
  monthly_cap: z.number().int().min(1).max(1000000),
  timezone: z.string().trim().min(1).max(64),
  throttle_pause_ms: z.number().int().min(100).max(10000),
  enforce_caps: z.boolean(),
  require_link_check: z.boolean(),
  block_url_shorteners: z.boolean(),
  auto_suppress_bounces: z.boolean(),
});

export type SettingsInput = z.infer<typeof updateSettingsInput>;

export const defaultSettings: OwnerSettings = {
  id: "default",
  business_name: "Campaign Companion",
  postal_address: "123 Business Street, Tech Park, Mumbai, MH 400001, India",
  support_email: "support@example.com",
  sender_domain: "example.com",
  from_address: "",
  daily_cap: 100,
  monthly_cap: 3000,
  timezone: "Asia/Kolkata",
  throttle_pause_ms: 1100,
  enforce_caps: true,
  require_link_check: true,
  block_url_shorteners: true,
  auto_suppress_bounces: true,
  updated_at: new Date().toISOString(),
};

export const getSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnerSettings> => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (!data) return defaultSettings;
    return { ...defaultSettings, ...(data as Partial<OwnerSettings>) } as OwnerSettings;
  },
);

export const getSenderStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  await assertOwner();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("settings")
    .select("from_address, sender_domain")
    .eq("id", "default")
    .maybeSingle();
  const fromAddress = (data?.from_address ?? "").trim();
  const validation = validateSenderAddress(fromAddress, data?.sender_domain);

  // Resolve the real reason: address missing/invalid vs. domain not verified at the provider.
  const { lookupResendDomain } = await import("./resend-domains.server");
  let domainStatus: ResendDomainStatus | null = null;
  if (validation.isValid) {
    domainStatus = await lookupResendDomain(validation.domain);
  }


  const providerVerified = domainStatus ? domainStatus.status === "verified" : null;
  const verified = validation.isValid && providerVerified !== false;

  let reason: SenderBlockReason = "ok";
  let detail = validation.message;
  if (!fromAddress) {
    reason = "address_missing";
    detail = "No sender address configured. Add one in Settings.";
  } else if (!validation.isValid) {
    reason = "address_invalid";
    detail = validation.message;
  } else if (providerVerified === false) {
    reason = "domain_unverified";
    detail = `The domain ${validation.domain} is not verified yet (provider status: ${domainStatus?.status ?? "unknown"}). Add the DNS records and re-verify before sending.`;
  } else if (providerVerified === null) {
    reason = "provider_unreachable";
    detail =
      "Sender address looks valid, but the provider could not be reached to confirm domain verification.";
  }

  return {
    fromAddress,
    verified,
    reason,
    detail,
    domain: validation.domain,
    domainStatus: domainStatus?.status ?? null,
    validation,
  };
});


export const getWebhookStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  await assertOwner();
  return {
    resendApiKey: Boolean(process.env["RESEND_API_KEY"]),
    webhookSecret: Boolean(process.env["RESEND_WEBHOOK_SECRET"]),
  };
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSettingsInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await supabaseAdmin
      .from("settings")
      .upsert({ id: "default", ...data, updated_at: new Date().toISOString() })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      action: "setting_change",
      details: { updated: data, timestamp: new Date().toISOString() },
    });

    return updated as OwnerSettings;
  });

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  value: string;
  status: "verified" | "pending" | "failed" | "recommended" | "not_started";
  purpose: string;
  priority?: number;
}

export const DEFAULT_SENDING_DOMAIN = "notify.designforge.me";

async function resolveSenderDomain(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("settings")
    .select("sender_domain, from_address")
    .eq("id", "default")
    .maybeSingle();

  if (data?.from_address && isVerifiedSenderAddress(data.from_address)) {
    const { extractEmail } = await import("./sender");
    const parts = extractEmail(data.from_address).split("@");
    if (parts.length === 2 && parts[1]) return parts[1];
  }
  return data?.sender_domain?.trim() || DEFAULT_SENDING_DOMAIN;
}

async function liveDnsSnapshot(domain: string) {
  const { lookupResendDomain } = await import("./resend-domains.server");
  const lookup = await lookupResendDomain(domain);

  if (!lookup) {
    return {
      domain,
      domainStatus: "unknown" as string,
      records: [] as DnsRecord[],
      allVerified: false,
      message:
        "Could not reach the email provider to read DNS status. Check that the API key is configured.",
      lastCheckedAt: new Date().toISOString(),
    };
  }

  if (lookup.status === "not_found") {
    return {
      domain,
      domainStatus: "not_found",
      records: [] as DnsRecord[],
      allVerified: false,
      message: `${domain} is not registered with the email provider yet. Add it there, then publish the DNS records it gives you.`,
      lastCheckedAt: new Date().toISOString(),
    };
  }

  const records: DnsRecord[] = lookup.records.map((r, index) => {
    const status = (r.status || "").toLowerCase();
    const normalized: DnsRecord["status"] =
      status === "verified"
        ? "verified"
        : status === "failed"
          ? "failed"
          : status === "not_started"
            ? "not_started"
            : "pending";
    return {
      id: `${r.record || r.type}-${index}`.toLowerCase(),
      type: r.type,
      name: r.name,
      value: r.value,
      status: normalized,
      purpose:
        r.record === "DKIM"
          ? "DKIM signature authentication"
          : r.record === "SPF"
            ? "SPF authorization for outbound mail"
            : r.type === "MX"
              ? "Return-Path for bounce and complaint feedback"
              : "Provider-required record",
      ...(r.priority !== undefined ? { priority: r.priority } : {}),
    };
  });

  // DMARC is not provisioned by the provider but is strongly recommended.
  const apex = domain.split(".").slice(-2).join(".");
  records.push({
    id: "dmarc",
    type: "TXT",
    name: `_dmarc.${domain}`,
    value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${apex}`,
    status: "recommended",
    purpose: "DMARC policy — start at p=none, tighten once reports look clean",
  });

  const required = records.filter((r) => r.status !== "recommended");
  return {
    domain,
    domainStatus: lookup.status,
    records,
    allVerified: required.length > 0 && required.every((r) => r.status === "verified"),
    message:
      lookup.status === "verified"
        ? "Domain is verified and ready to send."
        : `Domain status: ${lookup.status}. Publish the pending records at your DNS provider.`,
    lastCheckedAt: new Date().toISOString(),
  };
}

export const getDnsRecords = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  await assertOwner();
  return liveDnsSnapshot(await resolveSenderDomain());
});

export const verifyDomainDnsRecords = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ domain: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();
    const targetDomain = data.domain?.trim() || (await resolveSenderDomain());

    // Ask the provider to re-run verification, then read the fresh state back.
    const apiKey = process.env["RESEND_API_KEY"];
    const { lookupResendDomain } = await import("./resend-domains.server");
    const existing = await lookupResendDomain(targetDomain);
    if (apiKey && existing?.id) {
      try {
        await fetch(`https://api.resend.com/domains/${existing.id}/verify`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
      } catch (error) {
        console.warn("Domain re-verification request failed:", error);
      }
    }

    return liveDnsSnapshot(targetDomain);
  });

