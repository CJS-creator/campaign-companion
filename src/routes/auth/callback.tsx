import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthCallback() {
      try {
        const hash = window.location.hash;
        const search = window.location.search;
        const params = new URLSearchParams(search);
        const code = params.get("code");
        const type = params.get("type");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (hash && hash.includes("access_token")) {
          // Supabase implicitly handled implicit flow in client initialization
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (!data.session) {
            throw new Error("Failed to retrieve session from callback URL.");
          }
        }

        if (type === "recovery") {
          toast.success("Identity verified. Please set your new password.");
          navigate({ to: "/settings" });
          return;
        }

        toast.success("Successfully authenticated!");
        navigate({ to: "/", replace: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Authentication callback failed.";
        console.error("Auth callback error:", err);
        setErrorMsg(msg);
        toast.error(msg);
      }
    }

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md p-8 text-center space-y-4 shadow-xl border-border">
        {errorMsg ? (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-destructive">Authentication Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => navigate({ to: "/login" })}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <h2 className="text-lg font-semibold tracking-tight">Completing authentication…</h2>
            <p className="text-sm text-muted-foreground">Please wait while we verify your credentials.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
