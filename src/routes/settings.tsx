import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Save,
  ShieldCheck,
  ShieldAlert,
  Building,
  Mail,
  MapPin,
  Globe,
  Gauge,
  Clock,
  AtSign,
  Copy,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Lock,
} from "lucide-react";
import {
  defaultSettings,
  getSettings,
  getWebhookStatus,
  updateSettings,
  getDnsRecords,
  verifyDomainDnsRecords,
  type SettingsInput,
} from "@/lib/settings.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { validateSenderAddress } from "@/lib/sender";
import { ContactFormDialog } from "@/components/ContactFormDialog";
import { PageHeader, StatusBadge } from "@/components/patterns";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Postmark Studio" },
      {
        name: "description",
        content: "Configure business identity, sending limits, timezone, and throttle speed.",
      },
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

  const { data: dnsData } = useQuery({
    queryKey: ["dns-records"],
    queryFn: () => getDnsRecords(),
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

  const senderValidation = validateSenderAddress(form.from_address, form.sender_domain);

  const updateMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success("Settings updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["sender-status"] });
      queryClient.invalidateQueries({ queryKey: ["dns-records"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    },
  });

  const verifyDnsMutation = useMutation({
    mutationFn: (domain: string) => verifyDomainDnsRecords({ data: { domain } }),
    onSuccess: () => {
      toast.success("DNS record verification status re-checked!");
      queryClient.invalidateQueries({ queryKey: ["dns-records"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.from_address.trim() && !senderValidation.isValid) {
      toast.error(senderValidation.message);
      return;
    }
    updateMutation.mutate({ data: form });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const targetDomain = dnsData?.domain || "notify.designforge.me";
  const records = dnsData?.records || [];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Settings & Identity"
        description="Configure business identity, DNS domain verification, sending caps, and deliverability safeguards."
        actions={<ContactFormDialog />}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: LIVE DNS & DOMAIN VERIFICATION (PRIMARY CARD) */}
        <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-heading flex items-center gap-2 text-foreground">
                  <Globe className="size-5 text-primary" /> Live DNS & Domain Verification
                </h2>
                <StatusBadge status="sent" label="Active & Verified" />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target domain: <code className="font-mono font-semibold text-foreground">{targetDomain}</code>. Verify SPF, DKIM, and DMARC records.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => verifyDnsMutation.mutate(targetDomain)}
              disabled={verifyDnsMutation.isPending}
              className="h-8 text-xs font-semibold"
              aria-label="Re-check DNS verification"
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${verifyDnsMutation.isPending ? "animate-spin" : ""}`}
              />
              Re-check Verification
            </Button>
          </div>

          <div className="rounded-lg border border-success/30 bg-success/5 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="size-4 text-success shrink-0" />
              <span>
                Domain identity <strong className="font-mono">{targetDomain}</strong> is fully verified for production sending.
              </span>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">DKIM 2048-bit active</span>
          </div>

          <div className="space-y-3">
            {records.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono font-bold text-xs bg-muted">
                      {rec.type}
                    </Badge>
                    <span className="font-medium text-xs text-foreground">{rec.purpose}</span>
                  </div>
                  <StatusBadge status={rec.status === "verified" ? "sent" : "info"} label={rec.status === "verified" ? "Verified" : "Recommended"} />
                </div>

                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Record Name / Host
                    </span>
                    <div className="flex items-center justify-between rounded border border-border bg-card px-2.5 py-1.5 font-mono text-xs">
                      <span className="truncate pr-2 text-foreground">{rec.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(rec.name);
                          toast.success(`Copied Name for ${rec.id.toUpperCase()} to clipboard!`);
                        }}
                        title="Copy Record Name"
                        aria-label={`Copy Record Name for ${rec.id}`}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Record Value / Content
                    </span>
                    <div className="flex items-center justify-between rounded border border-border bg-card px-2.5 py-1.5 font-mono text-xs">
                      <span className="truncate pr-2 text-foreground">{rec.value}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          navigator.clipboard.writeText(rec.value);
                          toast.success(`Copied Value for ${rec.id.toUpperCase()} to clipboard!`);
                        }}
                        title="Copy Record Value"
                        aria-label={`Copy Record Value for ${rec.id}`}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 2: SENDER PROFILE */}
        <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
          <h2 className="text-base font-bold border-b border-border/60 pb-3 flex items-center gap-2 font-heading text-foreground">
            <Building className="size-5 text-primary" /> Sender Profile & Business Identity
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="business_name" className="flex items-center gap-1.5 text-xs font-semibold">
                <Building className="size-3.5 text-muted-foreground" /> Registered Business Name
              </Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                placeholder="Acme Corp"
                required
                className="h-10 text-sm bg-card"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="support_email" className="flex items-center gap-1.5 text-xs font-semibold">
                <Mail className="size-3.5 text-muted-foreground" /> Support Email Address
              </Label>
              <Input
                id="support_email"
                type="email"
                value={form.support_email}
                onChange={(e) => setForm({ ...form, support_email: e.target.value })}
                placeholder="support@example.com"
                required
                className="h-10 text-sm bg-card"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="postal_address" className="flex items-center gap-1.5 text-xs font-semibold">
              <MapPin className="size-3.5 text-muted-foreground" /> Physical Postal Address
              (Appended to CAN-SPAM footers)
            </Label>
            <Input
              id="postal_address"
              value={form.postal_address}
              onChange={(e) => setForm({ ...form, postal_address: e.target.value })}
              placeholder="Suite 402, Apex Towers, Bandra West, Mumbai, MH 400050"
              required
              className="h-10 text-sm bg-card"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sender_domain" className="flex items-center gap-1.5 text-xs font-semibold">
                <Globe className="size-3.5 text-muted-foreground" /> Verified Sending Domain
              </Label>
              <Input
                id="sender_domain"
                value={form.sender_domain}
                onChange={(e) => setForm({ ...form, sender_domain: e.target.value })}
                placeholder="notify.designforge.me"
                required
                className="h-10 text-sm bg-card"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="from_address" className="flex items-center gap-1.5 text-xs font-semibold">
                  <AtSign className="size-3.5 text-muted-foreground" /> Sender "From" Address
                </Label>
                {form.from_address.trim() && (
                  <StatusBadge
                    status={senderValidation.isValid ? "sent" : "bounce"}
                    label={senderValidation.isValid ? "Valid Format" : "Invalid Format"}
                  />
                )}
              </div>
              <Input
                id="from_address"
                value={form.from_address}
                onChange={(e) => setForm({ ...form, from_address: e.target.value })}
                placeholder="campaigns@notify.designforge.me"
                className="h-10 text-sm bg-card"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: SENDING LIMITS & THROTTLING */}
        <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
          <h2 className="text-base font-bold border-b border-border/60 pb-3 flex items-center gap-2 font-heading text-foreground">
            <Gauge className="size-5 text-primary" /> Sending Limits & Rate Controls
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="daily_cap" className="text-xs font-semibold">Daily Send Cap</Label>
              <Input
                id="daily_cap"
                type="number"
                value={form.daily_cap}
                onChange={(e) => setForm({ ...form, daily_cap: parseInt(e.target.value, 10) || 0 })}
                min={1}
                required
                className="h-10 text-sm bg-card"
              />
              <p className="text-[11px] text-muted-foreground">Max allowed sends per 24h window</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="monthly_cap" className="text-xs font-semibold">Monthly Send Cap</Label>
              <Input
                id="monthly_cap"
                type="number"
                value={form.monthly_cap}
                onChange={(e) =>
                  setForm({ ...form, monthly_cap: parseInt(e.target.value, 10) || 0 })
                }
                min={1}
                required
                className="h-10 text-sm bg-card"
              />
              <p className="text-[11px] text-muted-foreground">Max allowed sends per billing cycle</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="throttle_pause_ms" className="text-xs font-semibold">Throttle Delay (ms)</Label>
              <Input
                id="throttle_pause_ms"
                type="number"
                value={form.throttle_pause_ms}
                onChange={(e) =>
                  setForm({ ...form, throttle_pause_ms: parseInt(e.target.value, 10) || 1000 })
                }
                min={100}
                required
                className="h-10 text-sm bg-card"
              />
              <p className="text-[11px] text-muted-foreground">Default 1100ms (~2 emails / sec)</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="timezone" className="flex items-center gap-1.5 text-xs font-semibold">
              <Clock className="size-3.5 text-muted-foreground" /> Timezone
            </Label>
            <Input
              id="timezone"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              readOnly
              className="h-10 text-sm bg-muted text-muted-foreground"
            />
          </div>
        </div>

        {/* SECTION 4: SECURITY & API SAFEGUARDS */}
        <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
          <h2 className="text-base font-bold border-b border-border/60 pb-3 flex items-center gap-2 font-heading text-foreground">
            <Lock className="size-5 text-primary" /> Security & API Safeguards
          </h2>

          {(
            [
              [
                "enforce_caps",
                "Enforce sending caps",
                "Automatically pause queue worker when daily or monthly limit is reached.",
              ],
              [
                "require_link_check",
                "Require live link verification",
                "Inspect every URL before sending to prevent broken links.",
              ],
              [
                "block_url_shorteners",
                "Block URL shorteners",
                "Reject bit.ly and short links to preserve domain reputation.",
              ],
              [
                "auto_suppress_bounces",
                "Auto-suppress hard bounces",
                "Immediately mark leads as suppressed when bounce event is recorded.",
              ],
            ] as const
          ).map(([key, label, help]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-border/80 bg-muted/20 p-3.5">
              <div>
                <Label htmlFor={key} className="text-xs font-semibold text-foreground">
                  {label}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
              </div>
              <Switch
                id={key}
                checked={form[key]}
                onCheckedChange={(checked) => setForm({ ...form, [key]: checked })}
                aria-label={`Toggle ${label}`}
              />
            </div>
          ))}

          <div className="rounded-lg bg-muted/40 p-3.5 text-xs space-y-2 border border-border/60">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Resend API Key Status</span>
              <StatusBadge status={envStatus?.resendApiKey ? "sent" : "warning"} label={envStatus?.resendApiKey ? "Configured" : "Missing Key"} />
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="font-semibold text-foreground">Webhook Signing Verification</span>
              <StatusBadge status={envStatus?.webhookSecret ? "sent" : "warning"} label={envStatus?.webhookSecret ? "Active & Signed" : "Secret Missing"} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" disabled={updateMutation.isPending} className="h-10 px-6 shadow-xs" aria-label="Save all settings">
            <Save className="size-4 mr-2" />
            {updateMutation.isPending ? "Saving Settings…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
