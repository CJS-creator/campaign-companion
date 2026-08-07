import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "campaign_owner_session";
const SECRET = process.env["SESSION_SECRET"] || process.env["RESEND_API_KEY"] || "default_companion_owner_secret_key_2026";
const OWNER_PASS = process.env["OWNER_PASSWORD"] || "admin123";

export function getOwnerPassword(): string {
  return OWNER_PASS;
}

export function signSessionToken(val: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(val).digest("hex");
  return `${val}.${hmac}`;
}

export function verifySessionToken(token: string | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [val, hmac] = parts;
  if (!val || !hmac) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(val).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected));
}

export function createOwnerSessionCookie(): string {
  const token = signSessionToken("owner_authenticated");
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`; // 30 days
}

export function clearOwnerSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isRequestAuthenticated(request: Request): boolean {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return false;
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, v] = c.trim().split("=");
      return [k, v];
    })
  );
  return verifySessionToken(cookies[SESSION_COOKIE_NAME] || null);
}

export function requireOwnerAuth(request: Request) {
  if (!isRequestAuthenticated(request)) {
    throw new Error("Unauthorized: Owner login required.");
  }
}
