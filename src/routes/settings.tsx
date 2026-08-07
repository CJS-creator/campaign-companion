import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Settings, Save, ShieldCheck, ShieldAlert, Building, Mail, MapPin, Globe, Gauge, Clock, AtSign } from "lucide-react";
import { defaultSettings, getSettings, getWebhookStatus, updateSettings, type SettingsInput } from "@/lib/settings.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Owner Settings — Postmark Studio" },
      { name: "description", content: "Configure business identity, sending limits, timezone, and throttle speed." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  const { data: envStatus } = useQuery({
    queryKey: ["webhook-status"],
    queryFn: () => getWebhookStatus(),
  });

  const [form, setForm] = useState<SettingsInput>({
    business_name: "",
    postal_address: "",
    support_email: "",
    sender_domain: "",
    from_address: defaultSettings.from_address,
    daily_cap: 100,
    monthly_cap: 3000,
    timezone: "Asia/Kolkata",
    throttle_pause_ms: 1100,
    enforce_caps: true,
    require_link_check: true,
    block_url_shorteners: true,
    auto_suppress_bounces: true,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name || "",
        postal_address: settings.postal_address || "",
        support_email: settings.support_email || "",
        sender_domain: settings.sender_domain || "",
        from_address: settings.from_address || defaultSettings.from_address,
        daily_cap: settings.daily_cap || 100,
        monthly_cap: settings.monthly_cap || 3000,
        timezone: settings.timezone || "Asia/Kolkata",
        throttle_pause_ms: settings.throttle_pause_ms || 1100,
        enforce_caps: settings.enforce_caps ?? true,
        require_link_check: settings.require_link_check ?? true,
        block_url_shorteners: settings.block_url_shorteners ?? true,
        auto_suppress_bounces: settings.auto_suppress_bounces ?? true,
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success("Owner settings updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ data: form });
  };

  if (isLoading) return <p className="text-muted-foreground p-6">Loading owner settings…</p>;

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Settings className="size-7 text-primary" /> Owner Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure business identity details required for DPDP compliance, delivery throttling, and sending caps.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-medium border-b pb-2 flex items-center gap-2">
            <Building className="size-5 text-primary" /> Business & Sender Identity (DPDP Compliance)
          </h2>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="business_name" className="flex items-center gap-1.5">
                <Building className="size-3.5 text-muted-foreground" /> Registered Business Name
              </Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                placeholder="Acme India Corp"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support_email" className="flex items-center gap-1.5">
                <Mail className="size-3.5 text-muted-foreground" /> Support Email Address
              </Label>
              <Input
                id="support_email"
                type="email"
                value={form.support_email}
                onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                placeholder="support@acme.in"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="postal_address" className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground" /> Physical Postal Address (Appended to footers)
            </Label>
            <Input
              id="postal_address"
              value={form.postal_address}
              onChange={(e) => setForm({ ...form, postal_address: e.target.value })}
              placeholder="Suite 402, Apex Towers, Bandra West, Mumbai, MH 400050, India"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sender_domain" className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-muted-foreground" /> Verified Sending Domain
            </Label>
            <Input
              id="sender_domain"
              value={form.sender_domain}
              onChange={(e) => setForm({ ...form, sender_domain: e.target.value })}
              placeholder="acme.in"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="from_address" className="flex items-center gap-1.5">
              <AtSign className="size-3.5 text-muted-foreground" /> From address (used by the sending worker)
            </Label>
            <Input
              id="from_address"
              value={form.from_address}
              onChange={(e) => setForm({ ...form, from_address: e.target.value })}
              placeholder="Acme <hello@acme.in>"
              required
            />
            <p className="text-xs text-muted-foreground">
              Until your own domain is verified, keep <code className="font-mono">onboarding@resend.dev</code> — it only
              delivers to your own account address.
            </p>
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-medium border-b pb-2 flex items-center gap-2">
            <Gauge className="size-5 text-primary" /> Delivery Caps & Throttling
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="daily_cap">Daily Send Cap</Label>
              <Input
                id="daily_cap"
                type="number"
                value={form.daily_cap}
                onChange={(e) => setForm({ ...form, daily_cap: parseInt(e.target.value, 10) || 0 })}
                min={1}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="monthly_cap">Monthly Send Cap</Label>
              <Input
                id="monthly_cap"
                type="number"
                value={form.monthly_cap}
                onChange={(e) => setForm({ ...form, monthly_cap: parseInt(e.target.value, 10) || 0 })}
                min={1}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="throttle_pause_ms">Throttle Delay (ms)</Label>
              <Input
                id="throttle_pause_ms"
                type="number"
                value={form.throttle_pause_ms}
                onChange={(e) => setForm({ ...form, throttle_pause_ms: parseInt(e.target.value, 10) || 1000 })}
                min={100}
                required
              />
              <p className="text-xs text-muted-foreground">Default 1100ms (~2 emails per sec)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone" className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" /> Timezone
            </Label>
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              readOnly
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">Locked to India Standard Time (<code className="font-mono">Asia/Kolkata</code>)</p>
          </div>
        </Card>

        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-medium border-b pb-2 flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Security & Deliverability Safeguards
          </h2>

          {([
            ["enforce_caps", "Enforce sending caps", "Stop the worker once the daily or monthly cap is reached."],
            ["require_link_check", "Require live link verification", "Fetch every link before sending and block unreachable URLs."],
            ["block_url_shorteners", "Block shortened links", "Refuse to send campaigns containing bit.ly-style links."],
            ["auto_suppress_bounces", "Auto-suppress bounces & complaints", "Suppress a lead automatically when a hard bounce or complaint arrives."],
          ] as const).map(([key, label, help]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-md border p-3">
              <div>
                <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
              </div>
              <Switch
                id={key}
                checked={form[key]}
                onCheckedChange={(checked) => setForm({ ...form, [key]: checked })}
              />
            </div>
          ))}

          <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              {envStatus?.resendApiKey ? <ShieldCheck className="size-4 text-emerald-500" /> : <ShieldAlert className="size-4 text-amber-500" />}
              <span>Email API key {envStatus?.resendApiKey ? "configured" : "missing"}</span>
            </div>
            <div className="flex items-center gap-2">
              {envStatus?.webhookSecret ? <ShieldCheck className="size-4 text-emerald-500" /> : <ShieldAlert className="size-4 text-amber-500" />}
              <span>
                Webhook signing secret {envStatus?.webhookSecret
                  ? "configured — signed delivery events are verified and recorded"
                  : "missing — the webhook rejects all traffic until it is saved"}
              </span>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="size-4 mr-1.5" />
            {updateMutation.isPending ? "Saving Settings…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
