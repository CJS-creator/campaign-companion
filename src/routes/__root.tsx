import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useNavigate,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { getSessionStatus } from "../lib/app.functions";
import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { signOutUser } from "@/lib/auth";
import { User as UserIcon, LogOut, Settings as SettingsIcon } from "lucide-react";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Postmark Studio — Email campaigns" },
      {
        name: "description",
        content: "Collect leads, compose campaigns and track opens and clicks in one simple tool.",
      },
      { property: "og:title", content: "Postmark Studio — Email campaigns" },
      {
        property: "og:description",
        content: "Collect leads, compose campaigns and track opens and clicks in one simple tool.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    if (location.pathname.startsWith("/lovable/")) return;
    if (
      location.pathname.startsWith("/login") ||
      location.pathname.startsWith("/auth/") ||
      location.pathname.startsWith("/track")
    )
      return;

    const { authenticated } = await getSessionStatus();
    if (!authenticated) throw redirect({ to: "/login" });
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/analytics", label: "Analytics" },
  { to: "/leads", label: "Leads" },
  { to: "/campaigns/new", label: "Compose" },
  { to: "/events", label: "Events" },
  { to: "/diagnostics", label: "Diagnostics" },
  { to: "/settings", label: "Settings" },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState<User | null>(null);
  const isAuthRoute =
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/auth/") ||
    location.pathname.startsWith("/track/");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOutUser();
    await router.invalidate();
    navigate({ to: "/login", replace: true });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        {!isAuthRoute && (
          <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-3.5">
              <Link to="/" className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold text-xs">
                  PS
                </span>
                Postmark Studio
              </Link>

              <nav className="flex items-center gap-1 text-sm">
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: item.to === "/" }}
                    className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/50"
                    activeProps={{ className: "bg-secondary text-foreground font-medium" }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto flex items-center gap-3">
                {user ? (
                  <div className="flex items-center gap-3 bg-muted/40 pl-3 pr-2 py-1 rounded-full border border-border">
                    <span className="text-xs font-medium text-foreground max-w-[160px] truncate">
                      {user.user_metadata?.["full_name"] || user.email}
                    </span>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      title="Sign out"
                      className="flex size-7 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <Link
                    to="/login"
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </header>
        )}

        <main className="mx-auto max-w-5xl px-6 py-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
