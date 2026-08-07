import { useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface CampaignPreviewProps {
  subject: string;
  offerUrl: string;
  bodyHtml: string;
}

export function CampaignPreview({ subject, offerUrl, bodyHtml }: CampaignPreviewProps) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  let renderedHtml = bodyHtml || "<p style='color: #888;'>Start typing body text to see preview...</p>";
  renderedHtml = renderedHtml.replaceAll("{{name}}", "Jane");
  renderedHtml = renderedHtml.replaceAll(
    "{{offer_link}}",
    `<a href="${offerUrl || '#'}" target="_blank" style="color: #2563eb; text-decoration: underline;">${offerUrl || "https://example.com/offer"}</a>`
  );

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Live Recipient Email Preview
        </h3>
        <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 text-xs">
          <Button
            type="button"
            variant={device === "desktop" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-3.5 mr-1" /> Desktop
          </Button>
          <Button
            type="button"
            variant={device === "mobile" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setDevice("mobile")}
          >
            <Smartphone className="size-3.5 mr-1" /> Mobile
          </Button>
        </div>
      </div>

      <div
        className={`mx-auto transition-all duration-200 border border-border rounded-lg bg-background shadow-sm overflow-hidden ${
          device === "mobile" ? "max-w-xs" : "w-full"
        }`}
      >
        <div className="bg-muted/40 border-b border-border px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span><strong>From:</strong> onboarding@resend.dev</span>
            <span>Today</span>
          </div>
          <div className="text-muted-foreground">
            <strong>To:</strong> jane@example.com
          </div>
          <div className="font-semibold text-foreground text-sm pt-1">
            {subject || "Subject: (No subject line)"}
          </div>
        </div>

        <div className="p-5 text-sm leading-relaxed min-h-36">
          <div
            className="prose-editor"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
      </div>
    </Card>
  );
}
