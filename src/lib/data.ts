import {
  LEADS_PAGE_SIZE,
  fetchCampaign,
  fetchCampaigns,
  fetchEvents,
  fetchLeads,
  fetchLeadsPage,
  fetchSends,
  type LeadSort,
} from "@/lib/app.functions";
import type { Campaign, EventRow, Lead, Send } from "@/lib/types";

export type { Campaign, EventRow, Lead, Send, LeadSort };
export { LEADS_PAGE_SIZE };

export function leadsPageQuery({ search, sort, page }: { search: string; sort: LeadSort; page: number }) {
  return {
    queryKey: ["leads", "page", search.trim(), sort, page],
    queryFn: (): Promise<{ leads: Lead[]; count: number }> =>
      fetchLeadsPage({ data: { search, sort, page } }),
  };
}

export const leadsQuery = {
  queryKey: ["leads", "all"],
  queryFn: (): Promise<Lead[]> => fetchLeads({ data: { search: "" } }),
};

export const campaignsQuery = {
  queryKey: ["campaigns"],
  queryFn: (): Promise<Campaign[]> => fetchCampaigns(),
};

export const sendsQuery = {
  queryKey: ["sends"],
  queryFn: (): Promise<Send[]> => fetchSends(),
};

export function campaignQuery(id: string) {
  return {
    queryKey: ["campaign", id],
    queryFn: (): Promise<Campaign | null> => fetchCampaign({ data: { id } }),
  };
}

export interface EventFilters {
  types: string[];
  campaignId: string | null;
  search: string;
  from: string | null;
  to: string | null;
}

export function eventsQuery(filters: EventFilters) {
  return {
    queryKey: ["events", filters],
    queryFn: (): Promise<EventRow[]> =>
      fetchEvents({ data: { ...filters, limit: 1000 } }),
  };
}
