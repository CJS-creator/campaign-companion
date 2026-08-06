import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { campaignQuery, leadsQuery, sendsQuery } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/campaigns/$id")({
  head: () => ({
    meta: [
      { title: "Campaign detail — Postmark Studio" },
      {
        name: "description",
        content: "See who opened and clicked this email campaign.",
      },
      { property: "og:title", content: "Campaign detail — Postmark Studio" },
      {
        property: "og:description",
        content: "See who opened and clicked this email campaign.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const { data: campaign, isLoading } = useQuery(campaignQuery(id));
  const { data: sends = [] } = useQuery(sendsQuery);
  const { data: leads = [] } = useQuery(leadsQuery);

  const rows = sends.filter((s) => s.campaign_id === id);
  const leadById = new Map(leads.map((l) => [l.id, l]));

  if (isLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!campaign) {
    return <p className="text-muted-foreground">Campaign not found.</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
        </Button>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{campaign.subject}</h1>
        <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
          <Badge variant={campaign.status === "sent" ? "default" : "secondary"}>
            {campaign.status}
          </Badge>
          {campaign.sent_at && <span>Sent {new Date(campaign.sent_at).toLocaleString()}</span>}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </h2>
        <div
          className="prose-editor text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: campaign.body_html }}
        />
      </Card>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Recipient</th>
              <th className="px-5 py-3 font-medium">Sent</th>
              <th className="px-5 py-3 font-medium">Opened</th>
              <th className="px-5 py-3 font-medium">Clicked</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  Nothing sent yet.
                </td>
              </tr>
            )}
            {rows.map((send) => (
              <tr key={send.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">
                  {leadById.get(send.lead_id)?.email ?? "Unknown"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {send.sent_at ? new Date(send.sent_at).toLocaleString() : "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {send.opened_at ? new Date(send.opened_at).toLocaleString() : "—"}
                </td>
                <td className="px-5 py-3 text-muted-foreground">
                  {send.clicked_at ? new Date(send.clicked_at).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
