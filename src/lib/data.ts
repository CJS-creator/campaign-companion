import { supabase } from "@/integrations/supabase/client";

export interface Lead {
  id: string;
  email: string;
  name: string | null;
  subscribed: boolean;
  created_at: string;
}

export interface Campaign {
  id: string;
  subject: string;
  body_html: string;
  offer_url: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export interface Send {
  attempt_count: number;
  id: string;
  campaign_id: string;
  lead_id: string;
  status: "queued" | "sending" | "sent" | "failed";
  failure_reason: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export const LEADS_PAGE_SIZE = 25;

export type LeadSort = "created_desc" | "email_asc" | "email_desc" | "name_asc" | "name_desc";

const leadSorts: Record<LeadSort, { column: "created_at" | "email" | "name"; ascending: boolean }> = {
  created_desc: { column: "created_at", ascending: false },
  email_asc: { column: "email", ascending: true },
  email_desc: { column: "email", ascending: false },
  name_asc: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
};

export function leadsPageQuery({ search, sort, page }: { search: string; sort: LeadSort; page: number }) {
  const normalizedSearch = search.trim().replace(/[%,()]/g, "\\$&");
  const { column, ascending } = leadSorts[sort];

  return {
    queryKey: ["leads", "page", normalizedSearch, sort, page],
    queryFn: async (): Promise<{ leads: Lead[]; count: number }> => {
      let query = supabase.from("leads").select("*", { count: "exact" });
      if (normalizedSearch) {
        query = query.or(`email.ilike.%${normalizedSearch}%,name.ilike.%${normalizedSearch}%`);
      }
      const { data, error, count } = await query
        .order(column, { ascending, nullsFirst: false })
        .range(page * LEADS_PAGE_SIZE, (page + 1) * LEADS_PAGE_SIZE - 1);
      if (error) throw error;
      return { leads: data as Lead[], count: count ?? 0 };
    },
  };
}

export const leadsQuery = {
  queryKey: ["leads"],
  queryFn: async (): Promise<Lead[]> => {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Lead[];
  },
};

export const campaignsQuery = {
  queryKey: ["campaigns"],
  queryFn: async (): Promise<Campaign[]> => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Campaign[];
  },
};

export const sendsQuery = {
  queryKey: ["sends"],
  queryFn: async (): Promise<Send[]> => {
    const { data, error } = await supabase.from("sends").select("*");
    if (error) throw error;
    return data as Send[];
  },
};

export function campaignQuery(id: string) {
  return {
    queryKey: ["campaign", id],
    queryFn: async (): Promise<Campaign | null> => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Campaign | null;
    },
  };
}
