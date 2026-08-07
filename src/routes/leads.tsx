import { useDeferredValue, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Search, Trash2, UserX, UserCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LEADS_PAGE_SIZE, leadsPageQuery, type Lead, type LeadSort } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadImport } from "@/components/LeadImport";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Postmark Studio" },
      { name: "description", content: "Add and manage the subscriber list for your email campaigns." },
      { property: "og:title", content: "Leads — Postmark Studio" },
      { property: "og:description", content: "Add and manage the subscriber list for your email campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

const leadSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  name: z.string().trim().max(100).optional(),
});

function LeadsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LeadSort>("created_desc");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const deferredSearch = useDeferredValue(search);
  const { data: pagedData, isLoading, isFetching } = useQuery(
    leadsPageQuery({ search: deferredSearch, sort, page }),
  );
  const leads = pagedData?.leads ?? [];
  const total = pagedData?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [deferredSearch, sort]);

  const toggleSelectAll = () => {
    if (leads.every((l) => selectedIds.has(l.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const addLead = useMutation({
    mutationFn: async () => {
      const parsed = leadSchema.parse({ email, name });
      const { error } = await supabase
        .from("leads")
        .insert({
          email: parsed.email.toLowerCase(),
          name: parsed.name || null,
          consent_source: "manual",
          consent_date: new Date().toISOString(),
          consent_note: "Added manually by the owner",
        });

      if (error) {
        throw new Error(error.code === "23505" ? "That email is already on the list." : error.message);
      }
    },
    onSuccess: () => {
      setEmail("");
      setName("");
      toast.success("Lead added");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof z.ZodError
        ? (err.issues[0]?.message ?? "Invalid input")
        : err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    },
  });

  const toggleSubscribed = useMutation({
    mutationFn: async (lead: Lead) => {
      const { error } = await supabase.from("leads").update({ subscribed: !lead.subscribed }).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: () => toast.error("Could not update lead"),
  });

  const bulkSubscriptionMutation = useMutation({
    mutationFn: async (subscribe: boolean) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from("leads")
        .update({ subscribed: subscribe })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, subscribe) => {
      toast.success(`Updated subscription for ${selectedIds.size} leads`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Bulk subscription update failed"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedIds.size} leads`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: () => toast.error("Bulk delete failed"),
  });

  const exportCsv = async () => {
    if (total === 0) {
      toast.info("No leads to export yet");
      return;
    }
    const normalizedSearch = deferredSearch.trim().replace(/[%,()]/g, "\\$&");
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (normalizedSearch) {
      query = query.or(`email.ilike.%${normalizedSearch}%,name.ilike.%${normalizedSearch}%`);
    }
    const { data, error } = await query;
    if (error) {
      toast.error("Could not export leads");
      return;
    }
    const exportLeads = (data ?? []) as Lead[];
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["email", "name", "subscribed", "created_at"],
      ...exportLeads.map((lead) => [lead.email, lead.name ?? "", lead.subscribed ? "true" : "false", lead.created_at]),
    ];
    const csv = rows.map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportLeads.length} ${exportLeads.length === 1 ? "lead" : "leads"}`);
  };

  const allOnPageSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total} {deferredSearch ? "matching" : "total"} lead{total === 1 ? "" : "s"}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download className="size-4" /> Export CSV
        </Button>
      </header>

      <Card className="p-5">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            addLead.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} maxLength={255} placeholder="jane@example.com" onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} maxLength={100} placeholder="Jane Doe" onChange={(event) => setName(event.target.value)} />
          </div>
          <Button type="submit" disabled={addLead.isPending}>{addLead.isPending ? "Adding…" : "Add lead"}</Button>
        </form>
      </Card>

      <LeadImport />

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email or name" aria-label="Search leads by email or name" className="pl-9 pr-8" />
            {search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as LeadSort)} className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground" aria-label="Sort leads">
              <option value="created_desc">Newest added</option>
              <option value="email_asc">Email A–Z</option>
              <option value="email_desc">Email Z–A</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </label>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/60 px-4 py-2.5 text-sm">
            <span className="font-medium text-foreground">{selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"} selected</span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkSubscriptionMutation.mutate(true)}
                disabled={bulkSubscriptionMutation.isPending}
              >
                <UserCheck className="size-3.5 mr-1" /> Subscribe
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkSubscriptionMutation.mutate(false)}
                disabled={bulkSubscriptionMutation.isPending}
              >
                <UserX className="size-3.5 mr-1" /> Unsubscribe
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => bulkDeleteMutation.mutate()}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="size-3.5 mr-1" /> Delete selected
              </Button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-3 text-center">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={toggleSelectAll} aria-label="Select all leads on page" />
                </th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Added</th>
                <th className="px-5 py-3 text-right font-medium">Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && leads.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">{deferredSearch ? "No leads match that search." : "No leads yet. Add your first one above."}</td></tr>}
              {leads.map((lead) => {
                const isSelected = selectedIds.has(lead.id);
                return (
                  <tr key={lead.id} className={`border-b border-border last:border-0 ${isSelected ? "bg-muted/30" : ""}`}>
                    <td className="px-3 py-3 text-center">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectOne(lead.id)} aria-label={`Select ${lead.email}`} />
                    </td>
                    <td className="px-5 py-3 font-medium">{lead.email}</td>
                    <td className="px-5 py-3 text-muted-foreground">{lead.name ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right"><Switch checked={lead.subscribed} onCheckedChange={() => toggleSubscribed.mutate(lead)} aria-label={`Toggle subscription for ${lead.email}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{page * LEADS_PAGE_SIZE + 1}–{Math.min((page + 1) * LEADS_PAGE_SIZE, total)} of {total}{isFetching && " · Updating…"}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((current) => current - 1)} disabled={page === 0}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((current) => current + 1)} disabled={page + 1 >= totalPages}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

