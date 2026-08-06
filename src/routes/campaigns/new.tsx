import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { leadsQuery } from "@/lib/data";
import { sendCampaign } from "@/lib/campaigns.functions";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/campaigns/new")({
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
  const qc = useQueryClient();
  const send = useServerFn(sendCampaign);
  const { data: leads = [] } = useQuery(leadsQuery);
  const recipients = leads.filter((l) => l.subscribed).length;

  const [subject, setSubject] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");

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
      return await send({ data: { campaignId: data.id as string } });
    }
    return null;
  };

  const handle = (mode: "draft" | "send") =>
    useMutationHandler(mode, save, qc, navigate, recipients);

  const draftMutation = handle("draft");
  const sendMutation = handle("send");

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">New campaign</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Goes out to {recipients} subscribed {recipients === 1 ? "lead" : "leads"}.
        </p>
      </header>

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
          <Input
            id="offer"
            value={offerUrl}
            placeholder="https://example.com/offer"
            onChange={(e) => setOfferUrl(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Use the toolbar to drop a{" "}
            <code className="rounded bg-muted px-1 py-0.5">{"{{offer_link}}"}</code>{" "}
            placeholder into the body. Clicks are tracked before redirecting here.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Body</Label>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={draftMutation.isPending || sendMutation.isPending}
            onClick={() => draftMutation.mutate()}
          >
            Save draft
          </Button>
          <Button
            disabled={sendMutation.isPending || draftMutation.isPending || recipients === 0}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? "Sending…" : `Send to ${recipients}`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function useMutationHandler(
  mode: "draft" | "send",
  save: (status: "draft" | "send") => Promise<{ delivered: number; attempted: number } | null>,
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
      } else {
        toast.success(`Sent to ${result?.delivered ?? recipients} recipients`);
      }
      navigate({ to: "/" });
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
