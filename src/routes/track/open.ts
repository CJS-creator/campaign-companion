import { createFileRoute } from "@tanstack/react-router";

const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export const Route = createFileRoute("/track/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sendId = new URL(request.url).searchParams.get("send_id");
        if (!sendId) return pixelResponse();

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("sends")
            .update({ opened_at: new Date().toISOString() })
            .eq("id", sendId)
            .is("opened_at", null);
        } catch (err) {
          console.error("track/open failed", err);
        }

        return pixelResponse();
      },
    },
  },
});
