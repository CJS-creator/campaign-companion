import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Tag,
  Clock,
  Calendar,
  Send,
  Eye,
  Edit3,
  Sparkles,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Users,
  Link2,
  Layers,
} from "lucide-react";
import { leadsQuery, campaignQuery } from "@/lib/data";
import { isVerifiedSenderAddress } from "@/lib/sender";
import { createCampaign } from "@/lib/app.functions";
import { sendCampaign, scheduleCampaign } from "@/lib/campaigns.functions";
import { getSettings } from "@/lib/settings.functions";
import { verifyLink, type LinkCheckResult } from "@/lib/links.functions";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CampaignPreview } from "@/components/CampaignPreview";
import { PreSendChecklist } from "@/components/PreSendChecklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader, StatusBadge } from "@/components/patterns";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaigns/new")({
  validateSearch: (search: Record<string, unknown>): { clone?: string } =>
    typeof search["clone"] === "string" ? { clone: search["clone"] } : {},
  head: () => ({
    meta: [
      { title: "New Campaign Wizard — Postmark Studio" },
      {
        name: "description",
        content: "Compose a subject line and rich text email with a tracked offer link.",
      },
    ],
  }),
  component: ComposerPage,
});

const schema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  offerUrl: z.union([z.string().trim().url("Offer link must be a valid URL"), z.literal("")]),
  bodyHtml: z.string().trim().min(1, "Write something in the body"),
});

const EMAIL_TEMPLATES = [
  {
    name: "Product Feature Launch",
    subject: "🚀 Introducing our biggest upgrade yet!",
    offerUrl: "https://notify.designforge.me/launch",
    bodyHtml: `<h2>Hi {{name}},</h2><p>We are thrilled to announce a major feature release designed to help you scale faster.</p><p>Key highlights include real-time analytics, automated lead workflows, and seamless integrations.</p><p style="margin-top: 1.5rem;"><a href="{{offer_link}}" style="background: #3b82f6; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Explore the New Features &rarr;</a></p>`,
  },
  {
    name: "Special Discount Offer",
    subject: "🎁 Exclusive 20% discount just for you",
    offerUrl: "https://notify.designforge.me/discount",
    bodyHtml: `<h2>Special Offer for {{name}}!</h2><p>As a valued subscriber, we're giving you an exclusive 20% discount on all premium plans this week.</p><p>Use code <strong>SAVE20</strong> at checkout to claim your offer.</p><p style="margin-top: 1.5rem;"><a href="{{offer_link}}" style="background: #10b981; color: #fff; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">Claim Discount Now &rarr;</a></p>`,
  },
  {
    name: "Monthly Newsletter",
    subject: "📰 Your Monthly Postmark Studio Digest",
    offerUrl: "https://notify.designforge.me/newsletter",
    bodyHtml: `<h2>Monthly Digest for {{name}}</h2><p>Welcome to this month's issue! Here are the top stories, deliverability tips, and community highlights.</p><ul><li>5 strategies to boost open rates past 45%</li><li>Understanding DKIM and SPF authentication</li><li>Best practices for clean lead capture forms</li></ul><p><a href="{{offer_link}}">Read the full newsletter on our blog &rarr;</a></p>`,
  },
];

type Step = 1 | 2 | 3 | 4;

function ComposerPage() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/campaigns/new" });
  const qc = useQueryClient();
  const send = useServerFn(sendCampaign);
  const schedule = useServerFn(scheduleCampaign);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });

  const senderVerified = isVerifiedSenderAddress(settings?.from_address ?? "");

  const { data: leads = [] } = useQuery(leadsQuery);
  const subscribedLeads = leads.filter((l) => l.subscribed);
  const recipients = subscribedLeads.length;

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [subject, setSubject] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false);

  const cloneId = searchParams.clone;
  const { data: cloneSource } = useQuery({
    ...campaignQuery(cloneId || ""),
    enabled: Boolean(cloneId),
  });

  useEffect(() => {
    if (cloneSource) {
      setSubject(`Copy of ${cloneSource.subject}`);
      setOfferUrl(cloneSource.offer_url || "");
      setBodyHtml(cloneSource.body_html || "");
      toast.info("Pre-filled content from cloned campaign");
    }
  }, [cloneSource]);

  const check = useServerFn(verifyLink);
  const [linkResult, setLinkResult] = useState<LinkCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const linkVerified = offerUrl.trim().length === 0 || linkResult?.ok === true;

  useEffect(() => {
    setLinkResult(null);
  }, [offerUrl]);

  const runCheck = async () => {
    if (!offerUrl.trim()) return;
    setChecking(true);
    try {
      const result = await check({ data: { url: offerUrl } });
      setLinkResult(result);
      if (result.ok) toast.success("Link looks safe");
      else toast.error("Link failed safety check");
    } catch {
      toast.error("Couldn't run link check");
    } finally {
      setChecking(false);
    }
  };

  const insertTag = (tag: string) => {
    setBodyHtml((prev) => `${prev} ${tag}`);
    toast.success(`Inserted ${tag}`);
  };

  const applyTemplate = (tpl: (typeof EMAIL_TEMPLATES)[0]) => {
    setSubject(tpl.subject);
    setOfferUrl(tpl.offerUrl);
    setBodyHtml(tpl.bodyHtml);
    toast.success(`Loaded "${tpl.name}" template!`);
  };

  const save = async (status: "draft" | "send" | "schedule") => {
    const parsed = schema.parse({ subject, offerUrl, bodyHtml });
    const data = await createCampaign({
      data: {
        subject: parsed.subject,
        bodyHtml: parsed.bodyHtml,
        offerUrl: parsed.offerUrl || null,
      },
    });

    if (status === "send") {
      void send({ data: { campaignId: data.id as string } })
        .then(() => {
          qc.invalidateQueries({ queryKey: ["campaigns"] });
          qc.invalidateQueries({ queryKey: ["sends"] });
        })
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Campaign delivery could not start");
          qc.invalidateQueries({ queryKey: ["campaigns"] });
        });
    } else if (status === "schedule" && scheduledFor) {
      const isoDate = new Date(scheduledFor).toISOString();
      await schedule({ data: { campaignId: data.id as string, scheduledFor: isoDate } });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
    }

    return { campaignId: data.id as string, started: status === "send" };
  };

  const draftMutation = useMutationHandler("draft", save, qc, navigate, recipients);
  const sendMutation = useMutationHandler("send", save, qc, navigate, recipients);
  const scheduleMutation = useMutationHandler("schedule", save, qc, navigate, recipients);

  const senderConfigured = Boolean(settings?.business_name && settings?.postal_address);

  const steps = [
    { number: 1, title: "Content", icon: Edit3, description: "Subject & Email Body" },
    { number: 2, title: "Links", icon: Link2, description: "Tracked Offer URL" },
    { number: 3, title: "Recipients", icon: Users, description: "Audience Selection" },
    { number: 4, title: "Review", icon: Layers, description: "Checklist & Launch" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaign Composer"
        description={`Targeting ${recipients} subscribed ${recipients === 1 ? "lead" : "leads"}.`}
        backLink={{ to: "/", label: "Back to Dashboard" }}
        actions={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-xs" aria-label="Load starter template">
                  <Sparkles className="size-3.5 mr-1.5 text-amber-500" /> Starter Templates
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                {EMAIL_TEMPLATES.map((tpl) => (
                  <DropdownMenuItem
                    key={tpl.name}
                    onClick={() => applyTemplate(tpl)}
                    className="flex items-center gap-2 text-xs font-semibold cursor-pointer py-2"
                  >
                    <FileText className="size-3.5 text-primary" />
                    {tpl.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => setShowPreviewDrawer(!showPreviewDrawer)}
              aria-label="Toggle email preview"
            >
              <Eye className="size-3.5 mr-1.5" />
              {showPreviewDrawer ? "Hide Preview" : "Live Preview"}
            </Button>
          </div>
        }
      />

      {/* Step Indicator Header Bar */}
      <div className="glass-panel rounded-xl p-4 border border-border/80 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {steps.map((step) => {
            const isActive = currentStep === step.number;
            const isDone = currentStep > step.number;

            return (
              <button
                type="button"
                key={step.number}
                onClick={() => setCurrentStep(step.number as Step)}
                className={cn(
                  "flex items-center gap-3 rounded-lg p-2.5 text-left transition-all",
                  isActive
                    ? "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
                    : isDone
                      ? "bg-muted/40 hover:bg-muted/70"
                      : "opacity-60 hover:opacity-100"
                )}
              >
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isDone
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle2 className="size-4" /> : step.number}
                </div>
                <div className="hidden xs:block min-w-0">
                  <div className={cn("text-xs font-bold truncate", isActive ? "text-primary" : "text-foreground")}>
                    {step.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{step.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Wizard Form on Left (2 cols), Right Rail on Right (1 col) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Wizard Step Forms */}
        <div className="lg:col-span-2 space-y-6">
          {/* STEP 1: CONTENT */}
          {currentStep === 1 && (
            <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold font-heading flex items-center gap-2">
                  <Edit3 className="size-4.5 text-primary" /> Step 1: Subject Line & Body Content
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Draft an engaging subject line and personalized email body HTML.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="subject" className="text-xs font-semibold">Subject Line</Label>
                <Input
                  id="subject"
                  value={subject}
                  maxLength={200}
                  placeholder="A little something for you…"
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 text-sm bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Email Body Content</Label>
                  <div className="flex items-center gap-1.5 text-xs">
                    <Tag className="size-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Insert Tag:</span>
                    <button
                      type="button"
                      aria-label="Insert {{name}} tag"
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/80 text-foreground"
                      onClick={() => insertTag("{{name}}")}
                    >
                      {"{{name}}"}
                    </button>
                    <button
                      type="button"
                      aria-label="Insert {{offer_link}} tag"
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/80 text-foreground"
                      onClick={() => insertTag("{{offer_link}}")}
                    >
                      {"{{offer_link}}"}
                    </button>
                  </div>
                </div>
                <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  onClick={() => {
                    if (!subject.trim()) {
                      toast.error("Subject is required");
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  className="gap-1.5 shadow-xs"
                >
                  Next: Add Links <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: LINKS */}
          {currentStep === 2 && (
            <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold font-heading flex items-center gap-2">
                  <Link2 className="size-4.5 text-primary" /> Step 2: Tracked Offer Link
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure and verify offer URLs to track recipient click engagements.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="offer" className="text-xs font-semibold">Tracked Offer Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="offer"
                    value={offerUrl}
                    placeholder="https://example.com/offer"
                    onChange={(e) => setOfferUrl(e.target.value)}
                    className="h-10 text-sm bg-card"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!offerUrl.trim() || checking}
                    onClick={runCheck}
                    className="h-10 text-xs shrink-0"
                    aria-label="Check link safety"
                  >
                    {checking ? <Loader2 className="size-4 animate-spin" /> : "Check Link Safety"}
                  </Button>
                </div>

                {linkResult && (
                  <div
                    className={cn(
                      "mt-3 rounded-lg border p-3.5 text-xs",
                      linkResult.ok
                        ? "border-success/40 bg-success/10 text-foreground"
                        : "border-destructive/40 bg-destructive/10 text-destructive"
                    )}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {linkResult.ok ? (
                        <ShieldCheck className="size-4 text-success" />
                      ) : (
                        <ShieldAlert className="size-4 text-destructive" />
                      )}
                      {linkResult.ok ? "Secure & Reachable URL" : "Link Verification Failed"}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between gap-2 pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-1.5">
                  <ArrowLeft className="size-4" /> Back to Content
                </Button>
                <Button onClick={() => setCurrentStep(3)} className="gap-1.5 shadow-xs">
                  Next: Select Audience <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: RECIPIENTS */}
          {currentStep === 3 && (
            <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold font-heading flex items-center gap-2">
                  <Users className="size-4.5 text-primary" /> Step 3: Audience & Recipients
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review audience list and subscriber state before initiating delivery.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold uppercase">Subscribed Leads</span>
                  <div className="text-2xl font-extrabold text-foreground tabular-nums">{recipients}</div>
                  <p className="text-[11px] text-muted-foreground">Will receive this campaign send</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4 space-y-1">
                  <span className="text-xs text-muted-foreground font-semibold uppercase">Suppressed / Opted Out</span>
                  <div className="text-2xl font-extrabold text-muted-foreground tabular-nums">
                    {leads.length - recipients}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Protected from delivery</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-2">
                <h3 className="text-xs font-semibold text-foreground">Sample Recipient Preview</h3>
                <div className="divide-y divide-border/60 text-xs">
                  {subscribedLeads.slice(0, 4).map((lead) => (
                    <div key={lead.id} className="py-2 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground">{lead.name || "Subscriber"}</span>
                        <span className="text-muted-foreground block text-[11px]">{lead.email}</span>
                      </div>
                      <StatusBadge status="active" label="Subscribed" />
                    </div>
                  ))}
                  {subscribedLeads.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">No active subscribed leads found in your list.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-1.5">
                  <ArrowLeft className="size-4" /> Back to Links
                </Button>
                <Button onClick={() => setCurrentStep(4)} className="gap-1.5 shadow-xs">
                  Next: Final Review <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & LAUNCH */}
          {currentStep === 4 && (
            <div className="glass-panel rounded-xl p-6 border border-border/80 space-y-5 shadow-xs">
              <div className="border-b border-border/60 pb-3">
                <h2 className="text-base font-bold font-heading flex items-center gap-2">
                  <Layers className="size-4.5 text-primary" /> Step 4: Final Review & Launch
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm scheduling options, verify sender details, and launch campaign.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4 text-xs">
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Subject:</span>
                  <strong className="text-foreground">{subject || "(No subject set)"}</strong>
                </div>
                <div className="flex justify-between border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Offer URL:</span>
                  <strong className="text-foreground font-mono">{offerUrl || "(None)"}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target Recipients:</span>
                  <strong className="text-foreground">{recipients} subscribed leads</strong>
                </div>
              </div>

              {isScheduling && (
                <div className="space-y-2 rounded-lg border border-border p-4 bg-card">
                  <Label htmlFor="scheduleTime" className="flex items-center gap-1.5 text-xs font-semibold">
                    <Calendar className="size-3.5 text-primary" /> Select Send Date & Time (IST)
                  </Label>
                  <Input
                    id="scheduleTime"
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>
              )}

              {!senderVerified && (
                <div className="flex items-center justify-between rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-foreground">
                  <span>No verified sender address configured. Campaign sending is disabled.</span>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link to="/settings">Settings</Link>
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-1.5">
                  <ArrowLeft className="size-4" /> Back to Audience
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      draftMutation.isPending || sendMutation.isPending || scheduleMutation.isPending
                    }
                    onClick={() => draftMutation.mutate()}
                    className="h-10 text-xs font-medium"
                  >
                    Save Draft
                  </Button>

                  {!isScheduling ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsScheduling(true)}
                      className="h-10 text-xs font-medium"
                    >
                      <Clock className="size-3.5 mr-1.5 text-primary" /> Schedule…
                    </Button>
                  ) : (
                    <Button
                      disabled={
                        scheduleMutation.isPending ||
                        !scheduledFor ||
                        recipients === 0 ||
                        !linkVerified ||
                        !senderVerified
                      }
                      onClick={() => scheduleMutation.mutate()}
                      className="h-10 text-xs font-medium"
                    >
                      <Calendar className="size-3.5 mr-1.5" /> Schedule for IST
                    </Button>
                  )}

                  <Button
                    disabled={
                      sendMutation.isPending ||
                      draftMutation.isPending ||
                      scheduleMutation.isPending ||
                      recipients === 0 ||
                      !linkVerified ||
                      !senderVerified
                    }
                    onClick={() => sendMutation.mutate()}
                    className="h-10 text-xs font-semibold shadow-xs"
                  >
                    <Send className="size-3.5 mr-1.5" />
                    {sendMutation.isPending ? "Starting…" : `Send to ${recipients} Now`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Live Preview Card Below or Modal */}
          {showPreviewDrawer && (
            <CampaignPreview subject={subject} offerUrl={offerUrl} bodyHtml={bodyHtml} />
          )}
        </div>

        {/* Right Column: Persistent Right Rail (Checklist & Quick Actions) */}
        <div className="space-y-6">
          <PreSendChecklist
            recipientCount={recipients}
            dailyCap={settings?.daily_cap || 100}
            monthlyCap={settings?.monthly_cap || 3000}
            senderConfigured={senderConfigured}
            senderVerified={senderVerified}
            linkVerified={linkVerified}
            hasPlainText={false}
            hasSubject={Boolean(subject.trim())}
            hasBody={Boolean(bodyHtml.replace(/<[^>]*>/g, "").trim())}
            scheduledTime={isScheduling ? scheduledFor : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function useMutationHandler(
  mode: "draft" | "send" | "schedule",
  save: (
    status: "draft" | "send" | "schedule",
  ) => Promise<{ campaignId: string; started: boolean }>,
  qc: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
  recipients: number,
) {
  return useMutation({
    mutationFn: () => save(mode),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["sends"] });
      if (mode === "draft") {
        toast.success("Draft saved");
        navigate({ to: "/" });
      } else if (mode === "schedule") {
        toast.success("Campaign scheduled successfully!");
        navigate({ to: "/" });
      } else {
        toast.success(`Sending to ${recipients} recipients`);
        navigate({ to: "/campaigns/$id", params: { id: result.campaignId } });
      }
    },
    onError: (err: unknown) => {
      const message =
        err instanceof z.ZodError
          ? (err.issues[0]?.message ?? "Invalid input")
          : err instanceof Error
            ? err.message
            : "Something went wrong";
      toast.error(message);
    },
  });
}
