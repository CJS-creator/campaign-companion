/** Live sender-domain verification lookups against the Resend API (server only). */

export type ResendDomainStatus = {
  id: string;
  name: string;
  status: string;
  records: ResendDomainRecord[];
};

export type ResendDomainRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  priority?: number;
  ttl?: string;
};

export type SenderBlockReason =
  | "ok"
  | "address_missing"
  | "address_invalid"
  | "domain_unverified"
  | "provider_unreachable";

async function resendFetch(path: string): Promise<unknown | null> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.warn("Resend domain lookup failed:", error);
    return null;
  }
}

/**
 * Finds the domain (or its closest parent) registered in the Resend account.
 * Returns null when the API key is missing or the provider is unreachable.
 */
export async function lookupResendDomain(domain: string): Promise<ResendDomainStatus | null> {
  const clean = (domain || "").trim().toLowerCase();
  if (!clean) return null;

  const list = (await resendFetch("/domains")) as { data?: Array<{ id: string; name: string; status?: string }> } | null;
  if (!list?.data) return null;

  const exact = list.data.find((d) => d.name?.toLowerCase() === clean);
  const parent = list.data.find((d) => clean.endsWith(`.${d.name?.toLowerCase()}`));
  const match = exact ?? parent;
  if (!match) {
    return { id: "", name: clean, status: "not_found", records: [] };
  }

  const detail = (await resendFetch(`/domains/${match.id}`)) as
    | { id?: string; name?: string; status?: string; records?: ResendDomainRecord[] }
    | null;

  return {
    id: match.id,
    name: match.name,
    status: detail?.status ?? match.status ?? "unknown",
    records: detail?.records ?? [],
  };
}
