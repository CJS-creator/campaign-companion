export type LinkIssue = { level: "error" | "warning"; message: string };

const PRIVATE_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
const SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "t.co",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
];

/** Static checks that need no network access. Runs on client and server. */
export function inspectUrl(raw: string): { url: URL | null; issues: LinkIssue[] } {
  const issues: LinkIssue[] = [];
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { url: null, issues: [{ level: "error", message: "That isn't a valid URL." }] };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return {
      url: null,
      issues: [{ level: "error", message: `Unsupported protocol "${url.protocol}".` }],
    };
  }

  if (url.protocol === "http:") {
    issues.push({
      level: "error",
      message: "Link is not secure (http). Use https so recipients aren't warned.",
    });
  }

  if (PRIVATE_HOST.test(url.hostname)) {
    issues.push({
      level: "error",
      message: "Host is local or private — recipients won't be able to reach it.",
    });
  }

  if (url.username || url.password) {
    issues.push({ level: "error", message: "Credentials embedded in the URL look like phishing." });
  }

  if (SHORTENERS.includes(url.hostname.toLowerCase())) {
    issues.push({
      level: "warning",
      message: "Shortened links hide the destination and hurt deliverability.",
    });
  }

  if (!url.hostname.includes(".")) {
    issues.push({ level: "error", message: "Hostname doesn't look like a public domain." });
  }

  if (/xn--/i.test(url.hostname)) {
    issues.push({
      level: "warning",
      message: "Punycode domain — double-check it isn't impersonating another brand.",
    });
  }

  return { url, issues };
}

export function hasBlockingIssue(issues: LinkIssue[]) {
  return issues.some((i) => i.level === "error");
}
