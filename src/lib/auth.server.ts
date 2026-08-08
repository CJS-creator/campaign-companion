import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface UserSession {
  userId: string;
  email: string;
  fullName?: string;
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

export function extractCookieToken(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie") || request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((c) => {
    const parts = c.trim().split("=");
    if (parts[0]) {
      cookies[parts[0]] = parts.slice(1).join("=");
    }
  });

  // Check for sb-access-token or supabase auth cookie
  for (const [key, val] of Object.entries(cookies)) {
    if (typeof val === "string" && (key.includes("auth-token") || key === "sb-access-token" || key === "sb_access_token")) {
      try {
        const decoded = decodeURIComponent(val);
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === "object" && "access_token" in parsed && typeof (parsed as { access_token: unknown }).access_token === "string") {
          return (parsed as { access_token: string }).access_token;
        }
        if (Array.isArray(parsed) && typeof parsed[0] === "string") {
          return parsed[0];
        }
      } catch {
        if (typeof val === "string" && val.split(".").length === 3) {
          return val;
        }
      }
    }
  }

  const campaignToken = cookies["campaign_auth_token"];
  if (typeof campaignToken === "string" && campaignToken.length > 0) {
    return campaignToken;
  }

  return null;
}

export async function getAuthenticatedUser(request?: Request): Promise<UserSession | null> {
  const req = request || getRequest();
  if (!req) return null;

  const token = extractBearerToken(req) || extractCookieToken(req);
  if (!token) return null;

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return null;

    return {
      userId: data.user.id,
      email: data.user.email || "",
      fullName: (data.user.user_metadata?.["full_name"] as string | undefined) || (data.user.user_metadata?.["name"] as string | undefined) || "",
    };
  } catch {
    return null;
  }
}

export async function requireUserAuth(request?: Request): Promise<UserSession> {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    throw new Error("Unauthorized: Authentication required.");
  }
  return session;
}
