import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { inspectUrl, hasBlockingIssue, type LinkIssue } from "./link-safety";

const input = z.object({ url: z.string().trim().min(1).max(2048) });

export type LinkCheckResult = {
  ok: boolean;
  finalUrl: string | null;
  status: number | null;
  redirected: boolean;
  issues: LinkIssue[];
};

export const verifyLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => input.parse(data))
  .handler(async ({ data }): Promise<LinkCheckResult> => {
    const { url, issues } = inspectUrl(data.url);
    if (!url || hasBlockingIssue(issues)) {
      return { ok: false, finalUrl: null, status: null, redirected: false, issues };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      let res = await fetch(url.toString(), {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
      });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url.toString(), {
          method: "GET",
          redirect: "follow",
          signal: controller.signal,
        });
      }

      const finalUrl = res.url || url.toString();
      const redirected = finalUrl !== url.toString();

      if (redirected && new URL(finalUrl).protocol !== "https:") {
        issues.push({ level: "error", message: "Link redirects to an insecure (http) page." });
      }
      if (redirected && new URL(finalUrl).hostname !== url.hostname) {
        issues.push({
          level: "warning",
          message: `Redirects to a different domain: ${new URL(finalUrl).hostname}`,
        });
      }
      if (res.status >= 400) {
        issues.push({
          level: "error",
          message: `Destination returned ${res.status} — recipients would hit a broken page.`,
        });
      }

      return {
        ok: !hasBlockingIssue(issues),
        finalUrl,
        status: res.status,
        redirected,
        issues,
      };
    } catch {
      issues.push({ level: "error", message: "Couldn't reach the link (timeout or DNS failure)." });
      return { ok: false, finalUrl: null, status: null, redirected: false, issues };
    } finally {
      clearTimeout(timer);
    }
  });
