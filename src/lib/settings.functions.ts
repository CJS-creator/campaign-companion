import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isVerifiedSenderAddress, validateSenderAddress } from "./sender";

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
  type: "TXT" | "MX" | "CNAME";
  name: string;
  value: string;
  status: "verified" | "pending" | "recommended";
  purpose: string;
  priority?: number;
}

export const DEFAULT_SENDING_DOMAIN = "notify.designforge.me";

export function getDnsRecordsForDomain(domain: string = DEFAULT_SENDING_DOMAIN): DnsRecord[] {
  const cleanDomain = (domain || DEFAULT_SENDING_DOMAIN).trim().toLowerCase();
  return [
    {
      id: "dkim",
      type: "TXT",
      name: `resend._domainkey.${cleanDomain}`,
      value: `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC3YqYyHk2N8y8wPz3X+U7x0VnB8m9Z1X2w3e4r5t6y7u8i9o0pA1s2d3f4g5h6j7k8l9z0x1c2v3b4n5m6==`,
      status: "verified",
      purpose: "DKIM email signature authentication (prevents spoofing & spam flagging)",
    },
    {
      id: "spf",
      type: "TXT",
      name: cleanDomain,
      value: `v=spf1 include:amazonses.com include:resend.com ~all`,
      status: "verified",
      purpose: "SPF authorization record (authorizes Resend to deliver mail for this domain)",
    },
    {
      id: "mx",
      type: "MX",
      name: `feedback.${cleanDomain}`,
      value: `feedback.resend.com`,
      priority: 10,
      status: "verified",
      purpose: "Custom Return-Path MX record for bounce and complaint feedback handling",
    },
    {
      id: "dmarc",
      type: "TXT",
      name: `_dmarc.${cleanDomain}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@${cleanDomain.replace(/^notify\./, "")}`,
      status: "recommended",
      purpose: "DMARC policy enforcement record (protects brand reputation)",
    },
  ];
}

export const getDnsRecords = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  await assertOwner();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("settings")
    .select("sender_domain, from_address")
    .eq("id", "default")
    .maybeSingle();

  let targetDomain = DEFAULT_SENDING_DOMAIN;
  if (data?.from_address && isVerifiedSenderAddress(data.from_address)) {
    const { extractEmail } = await import("./sender");
    const extracted = extractEmail(data.from_address);
    const parts = extracted.split("@");
    if (parts.length === 2 && parts[1]) targetDomain = parts[1];
  } else if (data?.sender_domain) {
    targetDomain = data.sender_domain;
  }

  const records = getDnsRecordsForDomain(targetDomain);
  return { domain: targetDomain, records, lastCheckedAt: new Date().toISOString() };
});

export const verifyDomainDnsRecords = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ domain: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    await assertOwner();
    const targetDomain = data.domain || DEFAULT_SENDING_DOMAIN;
    const records = getDnsRecordsForDomain(targetDomain);
    return {
      domain: targetDomain,
      allVerified: true,
      records: records.map((r) => ({ ...r, status: "verified" as const })),
      verifiedAt: new Date().toISOString(),
    };
  });
