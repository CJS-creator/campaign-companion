import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export interface OwnerSettings {
  id: string;
  business_name: string;
  postal_address: string;
  support_email: string;
  sender_domain: string;
  daily_cap: number;
  monthly_cap: number;
  timezone: string;
  throttle_pause_ms: number;
  updated_at: string;
}

const updateSettingsInput = z.object({
  business_name: z.string().min(1, "Business name is required"),
  postal_address: z.string().min(5, "Postal address is required"),
  support_email: z.string().email("Valid support email required"),
  sender_domain: z.string().min(3, "Sender domain required"),
  daily_cap: z.number().int().min(1).max(100000),
  monthly_cap: z.number().int().min(1).max(1000000),
  timezone: z.string().min(1),
  throttle_pause_ms: z.number().int().min(100).max(10000),
});

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();

  if (!data) {
    return {
      id: "default",
      business_name: "Campaign Companion",
      postal_address: "123 Business Street, Tech Park, Mumbai, MH 400001, India",
      support_email: "support@example.com",
      sender_domain: "example.com",
      daily_cap: 100,
      monthly_cap: 3000,
      timezone: "Asia/Kolkata",
      throttle_pause_ms: 1100,
      updated_at: new Date().toISOString(),
    } as OwnerSettings;
  }

  return data as OwnerSettings;
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateSettingsInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: updated, error } = await supabaseAdmin
      .from("settings")
      .upsert({
        id: "default",
        ...data,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      action: "setting_change",
      details: { updated: data, timestamp: new Date().toISOString() },
    });

    return updated;
  });
