import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { ShieldCheck, ShieldAlert, Loader2, TriangleAlert, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { leadsQuery, campaignQuery } from "@/lib/data";
import { sendCampaign } from "@/lib/campaigns.functions";
import { verifyLink, type LinkCheckResult } from "@/lib/links.functions";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CampaignPreview } from "@/components/CampaignPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";


export const Route = createFileRoute("/campaigns/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    clone: typeof search["clone"] === "string" ? search["clone"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New campaign — Postmark Studio" },
      {
        name: "description",
        content: "Compose a subject line and rich text email with a tracked offer link.",
      },
      { property: "og:title", content: "New campaign — Postmark Studio" },
      {
        property: "og:description",
        content: "Compose a subject line and rich text email with a tracked offer link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ComposerPage,
});

const schema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  offerUrl: z.union([z.string().trim().url("Offer link must be a valid URL"), z.literal("")]),
  bodyHtml: z.string().trim().min(1, "Write something in the body"),
});

function ComposerPage() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/campaigns/new" });
  const qc = useQueryClient();
  const send = useServerFn(sendCampaign);
  const { data: leads = [] } = useQuery(leadsQuery);
  const recipients = leads.filter((l) => l.subscribed).length;

  const [subject, setSubject] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

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
  const linkVerified = linkResult?.ok === true;

  // Any edit to the offer link invalidates a previous verification.
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
      else toast.error("Link failed the safety check");
    } catch {
      toast.error("Couldn't run the link check");
    } finally {
      setChecking(false);
    }
  };

  const insertTag = (tag: string) => {
    setBodyHtml((prev) => `${prev} ${tag}`);
    toast.success(`Inserted ${tag}`);
  };

  const save = async (status: "draft" | "send") => {
    const parsed = schema.parse({ subject, offerUrl, bodyHtml });
    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        subject: parsed.subject,
        body_html: parsed.bodyHtml,
        offer_url: parsed.offerUrl || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
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
    }
    return { campaignId: data.id as string, started: status === "send" };
  };

  const draftMutation = useMutationHandler("draft", save, qc, navigate, recipients);
  const sendMutation = useMutationHandler("send", save, qc, navigate, recipients);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Goes out to {recipients} subscribed {recipients === 1 ? "lead" : "leads"}.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-5 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject line</Label>
            <Input
              id="subject"
              value={subject}
              maxLength={200}
              placeholder="A little something for you"
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offer">Offer link</Label>
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
              >
                {checking ? <Loader2 className="size-4 animate-spin" /> : "Check link"}
              </Button>
            </div>

            {linkResult && (
              <div
                className={`mt-2 rounded-md border p-3 text-sm ${
                  linkResult.ok
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {linkResult.ok ? (
                    <ShieldCheck className="size-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="size-4 text-destructive" />
                  )}
                  {linkResult.ok ? "Secure and reachable" : "This link can't be sent"}
                  {linkResult.status !== null && (
                    <span className="text-xs font-normal text-muted-foreground">
                      HTTP {linkResult.status}
                    </span>
                  )}
                </div>
                {linkResult.redirected && linkResult.finalUrl && (
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    Resolves to {linkResult.finalUrl}
                  </p>
                )}
                {linkResult.issues.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {linkResult.issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <TriangleAlert
                          className={`mt-0.5 size-3.5 shrink-0 ${
                            issue.level === "error" ? "text-destructive" : "text-amber-600"
                          }`}
                        />
                        <span>{issue.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Body</Label>
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

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="outline"
              disabled={draftMutation.isPending || sendMutation.isPending}
              onClick={() => draftMutation.mutate()}
            >
              Save draft
            </Button>
            <Button
              disabled={
                sendMutation.isPending ||
                draftMutation.isPending ||
                recipients === 0 ||
                (offerUrl.trim().length > 0 && !linkVerified)
              }
              onClick={() => sendMutation.mutate()}
            >
              {sendMutation.isPending ? "Starting…" : `Send to ${recipients}`}
            </Button>
            {offerUrl.trim().length > 0 && !linkVerified && (
              <span className="text-xs text-muted-foreground">
                Verify the offer link before sending.
              </span>
            )}
          </div>
        </Card>

        <CampaignPreview subject={subject} offerUrl={offerUrl} bodyHtml={bodyHtml} />
      </div>
    </div>
  );
}

function useMutationHandler(
  mode: "draft" | "send",
  save: (status: "draft" | "send") => Promise<{ campaignId: string; started: boolean }>,
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
