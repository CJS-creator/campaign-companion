import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Settings,
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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SkeletonCard } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { validateSenderAddress } from "@/lib/sender";
import { ContactFormDialog } from "@/components/ContactFormDialog";

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
    <div className="space-y-8 max-w-4xl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading flex items-center gap-2.5">
            <Settings className="size-7 text-primary" /> Settings & Identity
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure business identity details required for compliance, delivery throttling, and sending caps.
          </p>
        </div>
        <ContactFormDialog />
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-6 space-y-5 border-border/80 shadow-xs">
          <h2 className="text-base font-bold border-b border-border pb-3 flex items-center gap-2 font-heading">
            <Building className="size-5 text-primary" /> Business & Sender Identity
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
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="postal_address" className="flex items-center gap-1.5 text-xs font-semibold">
              <MapPin className="size-3.5 text-muted-foreground" /> Physical Postal Address
              (Appended to footers)
            </Label>
            <Input
              id="postal_address"
              value={form.postal_address}
              onChange={(e) => setForm({ ...form, postal_address: e.target.value })}
              placeholder="Suite 402, Apex Towers, Bandra West, Mumbai, MH 400050"
              required
            />
          </div>

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
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="from_address" className="flex items-center gap-1.5 text-xs font-semibold">
                <AtSign className="size-3.5 text-muted-foreground" /> Sender Address (Verified "from" address)
              </Label>
              {form.from_address.trim() ? (
                senderValidation.isValid ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="size-3.5" /> Verified Format & Domain
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-destructive">
                    <ShieldAlert className="size-3.5" /> Invalid Sender Address
                  </span>
                )
              ) : null}
            </div>
            <Input
              id="from_address"
              value={form.from_address}
              onChange={(e) => setForm({ ...form, from_address: e.target.value })}
              placeholder="campaigns@notify.designforge.me"
              className={
                form.from_address.trim()
                  ? senderValidation.isValid
                    ? "border-emerald-500/50 focus-visible:ring-emerald-500"
                    : "border-destructive/50 focus-visible:ring-destructive"
                  : ""
              }
            />
            <p className="text-xs text-muted-foreground">
              Must be an email address on your custom verified domain. Campaigns and test sends go out from this address.
            </p>

            {form.from_address.trim() && !senderValidation.isValid && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="size-4 shrink-0" />
                  Sender Address Validation Error
                </div>
                <p className="text-destructive/90">{senderValidation.message}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Resend DNS Domain Verification Records Section */}
        <Card className="p-6 space-y-5 border-border/80 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2 font-heading">
                <Globe className="size-5 text-primary" /> Resend DNS Domain Verification Records
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exact DNS records required to verify{" "}
                <code className="font-mono font-semibold text-foreground">{targetDomain}</code> for
                production email delivery.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => verifyDnsMutation.mutate(targetDomain)}
              disabled={verifyDnsMutation.isPending}
              className="h-8 text-xs"
            >
              <RefreshCw
                className={`size-3.5 mr-1.5 ${verifyDnsMutation.isPending ? "animate-spin" : ""}`}
              />
              Re-check Verification
            </Button>
          </div>

          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
              <span>
                Sending Domain Target: <strong className="font-mono text-xs">{targetDomain}</strong>
              </span>
            </div>
            <Badge className="bg-emerald-600 text-white text-[10px]">
              <CheckCircle2 className="size-3 mr-1 inline" /> Domain Status: Active & Verified
            </Badge>
          </div>

          <div className="space-y-3">
            {records.map((rec) => (
              <div key={rec.id} className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono font-bold text-xs bg-muted">
                      {rec.type}
                    </Badge>
                    <span className="font-medium text-xs text-foreground">{rec.purpose}</span>
                  </div>
                  <Badge
                    className={
                      rec.status === "verified"
                        ? "bg-emerald-600 text-white text-[10px]"
                        : "bg-sky-600 text-white text-[10px]"
                    }
                  >
                    <CheckCircle2 className="size-3 mr-1 inline" />
                    {rec.status === "verified" ? "Verified" : "Recommended"}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Record Name / Host
                    </span>
                    <div className="flex items-center justify-between rounded border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                      <span className="truncate pr-2">{rec.name}</span>
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
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Record Value / Content
                    </span>
                    <div className="flex items-center justify-between rounded border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
                      <span className="truncate pr-2">{rec.value}</span>
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
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Sending Quota Progress & Delivery Controls */}
        <Card className="p-6 space-y-5 border-border/80 shadow-xs">
          <h2 className="text-base font-bold border-b border-border pb-3 flex items-center gap-2 font-heading">
            <Gauge className="size-5 text-primary" /> Delivery Caps & Throttling
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
              />
              <div className="pt-1.5 space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Quota usage</span>
                  <span>Max {form.daily_cap}/day</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: "15%" }} />
                </div>
              </div>
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
              />
              <div className="pt-1.5 space-y-1">
                <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                  <span>Quota usage</span>
                  <span>Max {form.monthly_cap}/mo</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: "8%" }} />
                </div>
              </div>
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
              />
              <p className="text-xs text-muted-foreground">Default 1100ms (~2 emails per sec)</p>
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
              className="bg-muted"
            />
          </div>
        </Card>

        {/* Safeguards */}
        <Card className="p-6 space-y-5 border-border/80 shadow-xs">
          <h2 className="text-base font-bold border-b border-border pb-3 flex items-center gap-2 font-heading">
            <ShieldCheck className="size-5 text-primary" /> Security & Deliverability Safeguards
          </h2>

          {(
            [
              [
                "enforce_caps",
                "Enforce sending caps",
                "Stop the worker once the daily or monthly cap is reached.",
              ],
              [
                "require_link_check",
                "Require live link verification",
                "Fetch every link before sending and block unreachable URLs.",
              ],
              [
                "block_url_shorteners",
                "Block shortened links",
                "Refuse to send campaigns containing bit.ly-style links.",
              ],
              [
                "auto_suppress_bounces",
                "Auto-suppress bounces & complaints",
                "Suppress a lead automatically when a hard bounce or complaint arrives.",
              ],
            ] as const
          ).map(([key, label, help]) => (
            <div key={key} className="flex items-start justify-between gap-4 rounded-lg border border-border/80 p-3.5">
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
              />
            </div>
          ))}

          <div className="rounded-lg bg-muted/40 p-3.5 text-xs space-y-2 border border-border/60">
            <div className="flex items-center gap-2 font-medium">
              {envStatus?.resendApiKey ? (
                <ShieldCheck className="size-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-4 text-amber-500" />
              )}
              <span>Email API key {envStatus?.resendApiKey ? "configured" : "missing"}</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              {envStatus?.webhookSecret ? (
                <ShieldCheck className="size-4 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-4 text-amber-500" />
              )}
              <span>
                Webhook signing secret{" "}
                {envStatus?.webhookSecret
                  ? "configured — signed delivery events are verified and recorded"
                  : "missing — the webhook rejects all traffic until it is saved"}
              </span>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={updateMutation.isPending} className="h-10 px-6 shadow-sm">
            <Save className="size-4 mr-2" />
            {updateMutation.isPending ? "Saving Settings…" : "Save Settings"}
          </Button>
        </div>
      </form>
    </div>
  );
}
