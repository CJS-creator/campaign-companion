/** Shared helpers for the verified sender ("from") address. */

export const SHARED_TEST_ADDRESS = "onboarding@resend.dev";

/** Extracts the bare email out of `Name <email@domain>` or a plain address. */
export function extractEmail(value: string): string {
  if (!value) return "";
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

const EMAIL_RE = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export interface SenderValidationResult {
  isValid: boolean;
  reason: "missing" | "invalid_format" | "resend_dev_disallowed" | "valid";
  message: string;
  email: string;
  domain: string;
}

/**
 * Validates a sender address string against format rules and Resend domain rules.
 */
export function validateSenderAddress(
  value: string | null | undefined,
  configuredDomain?: string,
): SenderValidationResult {
  if (!value || !value.trim()) {
    return {
      isValid: false,
      reason: "missing",
      message:
        "No Sender Address configured. Enter an email address on your verified Resend domain (e.g. campaigns@yourdomain.com).",
      email: "",
      domain: "",
    };
  }

  const trimmed = value.trim();
  const email = extractEmail(trimmed);
  const domainParts = email.split("@");
  const domain: string = (domainParts.length === 2 && domainParts[1] ? domainParts[1] : "") || "";

  if (!EMAIL_RE.test(email) || !domain.includes(".")) {
    return {
      isValid: false,
      reason: "invalid_format",
      message:
        "Invalid email format. Use format 'name@yourdomain.com' or 'Sender Name <name@yourdomain.com>'.",
      email,
      domain,
    };
  }

  if (email.endsWith("@resend.dev")) {
    return {
      isValid: false,
      reason: "resend_dev_disallowed",
      message:
        "Shared 'onboarding@resend.dev' address is not allowed for campaign sending. Please specify a sender address on your verified custom domain in Settings.",
      email,
      domain,
    };
  }

  return {
    isValid: true,
    reason: "valid",
    message: `Verified Sender Address configured: ${trimmed}`,
    email,
    domain,
  };
}

/** True when a real, verified-domain sender address has been configured. */
export function isVerifiedSenderAddress(value: string | null | undefined): boolean {
  return validateSenderAddress(value).isValid;
}

export const SENDER_REQUIRED_MESSAGE =
  "No verified sender address is configured. Add your verified sending address (e.g. campaigns@yourdomain.com) in Settings before sending.";
