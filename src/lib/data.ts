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
  id: string;
  campaign_id: string;
  lead_id: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
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
