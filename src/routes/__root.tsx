import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useNavigate,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { getSessionStatus } from "../lib/app.functions";
import { useEffect, type ReactNode } from "react";

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
        content:
          "Collect leads, compose campaigns and track opens and clicks in one simple tool.",
      },
      { property: "og:title", content: "Postmark Studio — Email campaigns" },
      {
        property: "og:description",
        content:
          "Collect leads, compose campaigns and track opens and clicks in one simple tool.",
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
    if (location.pathname.startsWith("/login") || location.pathname.startsWith("/track")) return;
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

// Periodic background health check & queue worker tick. Must live INSIDE the
// QueryClientProvider — calling useQuery in RootComponent crashed SSR.
function BackgroundHealthCheck() {
  const location = useRouterState({ select: (s) => s.location.pathname });
  const enabled = !location.startsWith("/login") && !location.startsWith("/track");

  useQuery({
    queryKey: ["backgroundHealthCheck"],
    enabled,
    retry: false,
    queryFn: async () => {
      try {
        const { runHealthCheck } = await import("../lib/diagnostics.functions");
        return await runHealthCheck();
      } catch {
        return null;
      }
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();

  const signOut = async () => {
    const { logoutServerFn } = await import("./login");
    await logoutServerFn();
    await router.invalidate();
    navigate({ to: "/login" });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <BackgroundHealthCheck />
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-6 px-6 py-4">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              Postmark Studio
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              onClick={signOut}
              className="ml-auto rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </main>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
