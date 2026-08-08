import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
      (value) => value === "" || isVerifiedSenderAddress(value),
      "Enter a valid sender address on your verified domain (shared resend.dev addresses are not allowed)",
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
  from_address: "onboarding@resend.dev",
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

export const getSettings = createServerFn({ method: "GET" }).handler(async (): Promise<OwnerSettings> => {
  const { assertOwner } = await import("./owner-guard.server");
  assertOwner();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("settings").select("*").eq("id", "default").maybeSingle();
  if (!data) return defaultSettings;
  return { ...defaultSettings, ...(data as Partial<OwnerSettings>) } as OwnerSettings;
});

export const getWebhookStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { assertOwner } = await import("./owner-guard.server");
  assertOwner();
  return {
    resendApiKey: Boolean(process.env["RESEND_API_KEY"]),
    webhookSecret: Boolean(process.env["RESEND_WEBHOOK_SECRET"]),
  };
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSettingsInput.parse(data))
  .handler(async ({ data }) => {
    const { assertOwner } = await import("./owner-guard.server");
    assertOwner();
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
