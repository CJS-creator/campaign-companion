/** Shared helpers for the verified sender ("from") address. */

export const SHARED_TEST_ADDRESS = "onboarding@resend.dev";

/** Extracts the bare email out of `Name <email@domain>` or a plain address. */
export function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

const EMAIL_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

/** True when a real, verified-domain sender address has been configured. */
export function isVerifiedSenderAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  const email = extractEmail(value);
  if (!EMAIL_RE.test(email)) return false;
  return !email.endsWith("@resend.dev");
}

export const SENDER_REQUIRED_MESSAGE =
  "No verified sender address is configured. Add your verified sending address (e.g. campaigns@yourdomain.com) in Settings before sending.";
