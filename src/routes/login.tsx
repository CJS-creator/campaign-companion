import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { Lock, LogIn, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const loginServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const crypto = await import("node:crypto");
    const { getOwnerPassword, createOwnerSessionCookie } = await import("@/lib/auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const hash = (v: string) => crypto.createHash("sha256").update(v, "utf8").digest();
    const ok = crypto.timingSafeEqual(hash(data.password), hash(getOwnerPassword()));
    if (!ok) {
      return { success: false as const, error: "Invalid owner password." };
    }

    // Set signed session cookie
    const cookieHeader = createOwnerSessionCookie();
    setResponseHeader("Set-Cookie", cookieHeader);

    // Audit log
    await supabaseAdmin.from("audit_logs").insert({
      action: "owner_login",
      details: { timestamp: new Date().toISOString(), status: "success" },
    });

    return { success: true as const };
  });

export const logoutServerFn = createServerFn({ method: "POST" }).handler(async () => {
  const { clearOwnerSessionCookie } = await import("@/lib/auth.server");
  setResponseHeader("Set-Cookie", clearOwnerSessionCookie());
  return { success: true };
});

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Owner Login — Postmark Studio" },
      { name: "description", content: "Single-owner authentication gate for Postmark Studio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await loginServerFn({ data: { password } });
      if (!res.success) {
        setError(res.error ?? "Invalid owner password.");
        toast.error(res.error ?? "Invalid owner password.");
        return;
      }
      toast.success("Welcome back, Owner!");
      navigate({ to: "/" });
    } catch {
      setError("Login failed. Please try again.");
      toast.error("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-lg border-border">
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Campaign Companion</h1>
          <p className="text-sm text-muted-foreground">
            Single-owner security gate. Enter owner password to proceed.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Owner Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? (
              "Authenticating…"
            ) : (
              <span className="flex items-center gap-2">
                <LogIn className="size-4" /> Login as Owner
              </span>
            )}
          </Button>
        </form>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-md">
          <ShieldAlert className="size-4 shrink-0 text-amber-500" />
          <span>
            Default development password is{" "}
            <code className="font-mono bg-muted px-1 rounded">admin123</code> (configured via{" "}
            <code className="font-mono">OWNER_PASSWORD</code> env).
          </span>
        </div>
      </Card>
    </div>
  );
}
