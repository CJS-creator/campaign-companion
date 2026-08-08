import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Lock,
  LogIn,
  UserPlus,
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  signInWithPassword,
  signUpWithEmail,
  signInWithMagicLink,
  signInWithOAuth,
  resetPasswordForEmail,
} from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Authentication — Postmark Studio" },
      { name: "description", content: "Sign in or create an account for Postmark Studio." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  // Tab selection state
  const [activeTab, setActiveTab] = useState<"signin" | "signup" | "magic" | "forgot">("signin");

  // Input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      toast.success("Welcome back!");
      navigate({ to: "/", replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to sign in.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signUpWithEmail(email, password, fullName);
      if (res?.session) {
        toast.success("Account created successfully!");
        navigate({ to: "/", replace: true });
      } else {
        toast.success("Account created! Please check your email to confirm registration.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create account.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithMagicLink(email);
      toast.success("Magic link sent! Check your email inbox.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send magic link.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await resetPasswordForEmail(email);
      toast.success("Password reset instructions sent to your email!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send password reset.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialAuth = async (provider: "google" | "github") => {
    setLoading(true);
    setError(null);
    try {
      await signInWithOAuth(provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Failed to authenticate with ${provider}.`;
      setError(message);
      toast.error(message);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[75vh] items-center justify-center px-4 py-8">
      <div className="glass-panel w-full max-w-lg p-6 sm:p-8 space-y-6 shadow-xl border border-border/80 rounded-2xl transition-all">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20">
            <Lock className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight font-heading text-foreground">
            Postmark Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Secure, high-deliverability email campaign management portal
          </p>
        </div>

        {/* Social Authentication Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => handleSocialAuth("google")}
            aria-label="Sign in with Google"
            className="flex items-center justify-center gap-2 h-10 border-input hover:bg-accent transition-all"
          >
            <svg className="size-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="text-xs font-semibold">Google</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => handleSocialAuth("github")}
            aria-label="Sign in with GitHub"
            className="flex items-center justify-center gap-2 h-10 border-input hover:bg-accent transition-all"
          >
            <svg className="size-4 fill-current" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span className="text-xs font-semibold">GitHub</span>
          </Button>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/80" />
          </div>
          <span className="relative bg-card px-3 text-xs uppercase text-muted-foreground font-semibold">
            Or continue with
          </span>
        </div>

        {/* Tabbed Auth Portal */}
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val as typeof activeTab);
            setError(null);
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4 h-10 p-1 bg-muted/60 rounded-lg">
            <TabsTrigger value="signin" className="text-xs font-semibold">
              Sign In
            </TabsTrigger>
            <TabsTrigger value="signup" className="text-xs font-semibold">
              Sign Up
            </TabsTrigger>
            <TabsTrigger value="magic" className="text-xs font-semibold">
              Magic Link
            </TabsTrigger>
            <TabsTrigger value="forgot" className="text-xs font-semibold">
              Reset
            </TabsTrigger>
          </TabsList>

          {/* Error Banner */}
          {error && (
            <div role="alert" className="mt-4 p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md font-medium">
              {error}
            </div>
          )}

          {/* TAB 1: SIGN IN */}
          <TabsContent value="signin" className="space-y-4 pt-4">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signin-email" className="text-xs font-semibold">Email Address</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 text-sm bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="signin-password" className="text-xs font-semibold">Password</Label>
                  <button
                    type="button"
                    onClick={() => setActiveTab("forgot")}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-10 text-sm bg-card pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-10 shadow-xs" disabled={loading} aria-label="Sign in to account">
                {loading ? (
                  "Authenticating…"
                ) : (
                  <span className="flex items-center justify-center gap-2 font-semibold">
                    <LogIn className="size-4" /> Sign In
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* TAB 2: SIGN UP */}
          <TabsContent value="signup" className="space-y-4 pt-4">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signup-name" className="text-xs font-semibold">Full Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-10 text-sm bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-email" className="text-xs font-semibold">Email Address</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 text-sm bg-card"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="signup-password" className="text-xs font-semibold">Choose Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                    className="h-10 text-sm bg-card pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-10 shadow-xs" disabled={loading} aria-label="Register new account">
                {loading ? (
                  "Creating Account…"
                ) : (
                  <span className="flex items-center justify-center gap-2 font-semibold">
                    <UserPlus className="size-4" /> Register Account
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* TAB 3: MAGIC LINK */}
          <TabsContent value="magic" className="space-y-4 pt-4">
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="magic-email" className="text-xs font-semibold">Email Address</Label>
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 text-sm bg-card"
                />
                <p className="text-xs text-muted-foreground">
                  We'll email you a secure, passwordless magic link to sign in instantly.
                </p>
              </div>

              <Button type="submit" className="w-full h-10 shadow-xs" disabled={loading || !email} aria-label="Send magic link email">
                {loading ? (
                  "Sending Link…"
                ) : (
                  <span className="flex items-center justify-center gap-2 font-semibold">
                    <Sparkles className="size-4" /> Send Magic Link
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* TAB 4: FORGOT PASSWORD */}
          <TabsContent value="forgot" className="space-y-4 pt-4">
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-semibold">Account Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-10 text-sm bg-card"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your email address to receive password reset instructions.
                </p>
              </div>

              <Button type="submit" className="w-full h-10 shadow-xs" disabled={loading || !email} aria-label="Send reset password email">
                {loading ? (
                  "Processing…"
                ) : (
                  <span className="flex items-center justify-center gap-2 font-semibold">
                    <KeyRound className="size-4" /> Reset Password
                  </span>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {/* Security Badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/80">
          <ShieldCheck className="size-4 text-success shrink-0" />
          <span>Protected by Supabase Auth with Row Level Security (RLS)</span>
        </div>
      </div>
    </div>
  );
}
