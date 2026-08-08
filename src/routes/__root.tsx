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
import { LogOut, Menu, Sparkles } from "lucide-react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import appCss from "../styles.css?url";
import { Toaster } from "../components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-extrabold text-foreground tracking-tight">404</h1>
        <h2 className="mt-4 text-xl font-bold text-foreground">Page not found</h2>
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
        <h1 className="text-xl font-bold tracking-tight text-foreground">
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
    // Client-only gate: the Supabase session lives in localStorage, so the
    // server has no bearer token on a hard refresh and would always redirect.
    if (typeof window === "undefined") return;
    if (location.pathname.startsWith("/lovable/")) return;
    if (
      location.pathname.startsWith("/login") ||
      location.pathname.startsWith("/auth/") ||
      location.pathname.startsWith("/track")
    )
      return;

    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <ThemeProvider defaultTheme="system">
        <div className="min-h-screen bg-background font-sans antialiased text-foreground selection:bg-primary/20 selection:text-primary">
          {!isAuthRoute && (
            <header className="border-b border-border/80 bg-card/80 backdrop-blur-md sticky top-0 z-40 shadow-xs">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 py-3">
                <Link to="/" className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold text-xs shadow-xs ring-1 ring-primary/30">
                    PS
                  </span>
                  <span className="hidden sm:inline font-heading font-bold text-base bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
                    Postmark Studio
                  </span>
                </Link>

                {/* Desktop Navigation Links */}
                <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
                  {navItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      activeOptions={{ exact: item.to === "/" }}
                      className="rounded-md px-3 py-1.5 text-muted-foreground transition-all hover:text-foreground hover:bg-accent/60"
                      activeProps={{ className: "bg-secondary text-foreground font-semibold shadow-xs" }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>

                <div className="flex items-center gap-2 sm:gap-3">
                  <ThemeToggle />

                  {/* Desktop User Account Pill */}
                  {user ? (
                    <div className="hidden sm:flex items-center gap-2.5 bg-muted/50 pl-3 pr-1.5 py-1 rounded-full border border-border/80 text-xs">
                      <span className="font-medium text-foreground max-w-[140px] truncate">
                        {user.user_metadata?.["full_name"] || user.email}
                      </span>
                      <button
                        type="button"
                        onClick={handleSignOut}
                        title="Sign out"
                        className="flex size-7 items-center justify-center rounded-full bg-background text-muted-foreground transition-colors hover:text-destructive hover:bg-destructive/10 border border-border/40"
                      >
                        <LogOut className="size-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Link
                      to="/login"
                      className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 shadow-xs"
                    >
                      Sign In
                    </Link>
                  )}

                  {/* Mobile Drawer Trigger */}
                  <div className="md:hidden">
                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                      <SheetTrigger asChild>
                        <Button variant="outline" size="icon" className="size-8">
                          <Menu className="size-4" />
                          <span className="sr-only">Toggle menu</span>
                        </Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="w-72 bg-card border-border p-6 flex flex-col justify-between">
                        <div>
                          <SheetHeader className="text-left pb-4 border-b border-border">
                            <SheetTitle className="flex items-center gap-2 text-base font-bold">
                              <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                                PS
                              </span>
                              Postmark Studio
                            </SheetTitle>
                          </SheetHeader>

                          <nav className="flex flex-col gap-1.5 pt-6">
                            {navItems.map((item) => (
                              <Link
                                key={item.to}
                                to={item.to}
                                activeOptions={{ exact: item.to === "/" }}
                                onClick={() => setMobileMenuOpen(false)}
                                className="rounded-md px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
                                activeProps={{ className: "bg-secondary text-foreground font-semibold" }}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </nav>
                        </div>

                        {user && (
                          <div className="pt-6 border-t border-border space-y-3">
                            <div className="text-xs text-muted-foreground truncate">
                              Signed in as <strong className="text-foreground block">{user.email}</strong>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="w-full flex items-center gap-2"
                              onClick={() => {
                                setMobileMenuOpen(false);
                                handleSignOut();
                              }}
                            >
                              <LogOut className="size-4" /> Sign Out
                            </Button>
                          </div>
                        )}
                      </SheetContent>
                    </Sheet>
                  </div>
                </div>
              </div>
            </header>
          )}

          <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
