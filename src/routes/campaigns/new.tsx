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
  TriangleAlert,
  Tag,
  Clock,
  Calendar,
  Send,
  Eye,
  Edit3,
  Columns,
  Sparkles,
  FileText,
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
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/campaigns/new")({
  validateSearch: (search: Record<string, unknown>): { clone?: string } =>
    typeof search["clone"] === "string" ? { clone: search["clone"] } : {},
  head: () => ({
    meta: [
      { title: "New Campaign — Postmark Studio" },
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

type ViewMode = "split" | "editor" | "preview";

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
  const recipients = leads.filter((l) => l.subscribed).length;

  const [subject, setSubject] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("split");

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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight font-heading">
            Campaign Composer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Targeting {recipients} subscribed {recipients === 1 ? "lead" : "leads"}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Starter Templates Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs">
                <Sparkles className="size-3.5 mr-1.5 text-amber-500" /> Load Template
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

          {/* View Mode Controls */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
            <Button
              type="button"
              variant={viewMode === "split" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold"
              onClick={() => setViewMode("split")}
              title="Split Editor & Live Preview Side-by-Side"
            >
              <Columns className="size-3.5 mr-1" /> Split View
            </Button>
            <Button
              type="button"
              variant={viewMode === "editor" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold"
              onClick={() => setViewMode("editor")}
              title="Full Width Editor"
            >
              <Edit3 className="size-3.5 mr-1" /> Editor
            </Button>
            <Button
              type="button"
              variant={viewMode === "preview" ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs font-semibold"
              onClick={() => setViewMode("preview")}
              title="Full Width Live Preview"
            >
              <Eye className="size-3.5 mr-1" /> Preview
            </Button>
          </div>
        </div>
      </header>

      {/* Main Composer Layout */}
      <div
        className={`grid gap-6 ${
          viewMode === "split"
            ? "lg:grid-cols-2"
            : viewMode === "editor"
              ? "grid-cols-1"
              : "grid-cols-1"
        }`}
      >
        {/* Editor Form Card */}
        {(viewMode === "split" || viewMode === "editor") && (
          <Card className="space-y-5 p-6 border-border/80 shadow-xs">
            <div className="space-y-1.5">
              <Label htmlFor="subject" className="text-xs font-semibold">Subject Line</Label>
              <Input
                id="subject"
                value={subject}
                maxLength={200}
                placeholder="A little something for you…"
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="offer" className="text-xs font-semibold">Tracked Offer Link</Label>
              <div className="flex gap-2">
                <Input
                  id="offer"
                  value={offerUrl}
                  placeholder="https://example.com/offer"
                  onChange={(e) => setOfferUrl(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!offerUrl.trim() || checking}
                  onClick={runCheck}
                  className="h-10 text-xs shrink-0"
                >
                  {checking ? <Loader2 className="size-4 animate-spin" /> : "Check Link"}
                </Button>
              </div>

              {linkResult && (
                <div
                  className={`mt-2 rounded-lg border p-3 text-xs ${
                    linkResult.ok
                      ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-900 dark:text-emerald-300"
                      : "border-destructive/40 bg-destructive/5 text-destructive"
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {linkResult.ok ? (
                      <ShieldCheck className="size-4 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="size-4 text-destructive" />
                    )}
                    {linkResult.ok ? "Secure and Reachable" : "Link Cannot Be Sent"}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Email Body Content</Label>
                <div className="flex items-center gap-1.5 text-xs">
                  <Tag className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Tags:</span>
                  <button
                    type="button"
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/80"
                    onClick={() => insertTag("{{name}}")}
                  >
                    {"{{name}}"}
                  </button>
                  <button
                    type="button"
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-muted/80"
                    onClick={() => insertTag("{{offer_link}}")}
                  >
                    {"{{offer_link}}"}
                  </button>
                </div>
              </div>
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
            </div>

            <PreSendChecklist
              recipientCount={recipients}
              dailyCap={settings?.daily_cap || 100}
              monthlyCap={settings?.monthly_cap || 3000}
              senderConfigured={senderConfigured}
              linkVerified={linkVerified}
              hasPlainText={Boolean(bodyHtml.trim())}
              scheduledTime={isScheduling ? scheduledFor : undefined}
            />

            {isScheduling && (
              <div className="space-y-2 rounded-lg border border-border p-3.5 bg-muted/20">
                <Label
                  htmlFor="scheduleTime"
                  className="flex items-center gap-1.5 text-xs font-semibold"
                >
                  <Calendar className="size-3.5 text-primary" /> Select Send Date & Time (IST)
                </Label>
                <Input
                  id="scheduleTime"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                />
              </div>
            )}

            {!senderVerified && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-300">
                <span>No verified sender address is configured, so sending is disabled.</span>
                <Link to="/settings" className="font-semibold underline underline-offset-2">
                  Add in Settings
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
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
                <Button type="button" variant="outline" onClick={() => setIsScheduling(true)} className="h-10 text-xs font-medium">
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
                className="h-10 text-xs font-semibold shadow-sm"
              >
                <Send className="size-3.5 mr-1.5" />
                {sendMutation.isPending ? "Starting…" : `Send to ${recipients} Now`}
              </Button>
            </div>
          </Card>
        )}

        {/* Live Recipient Preview Card */}
        {(viewMode === "split" || viewMode === "preview") && (
          <CampaignPreview subject={subject} offerUrl={offerUrl} bodyHtml={bodyHtml} />
        )}
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
