import { useDeferredValue, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Search, Trash2, UserX, UserCheck, X, UserPlus, Users } from "lucide-react";
import { LEADS_PAGE_SIZE, leadsPageQuery, type Lead, type LeadSort } from "@/lib/data";
import { createLead, deleteLeads, fetchLeads, setLeadSubscription } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonTable } from "@/components/ui/skeleton";
import { LeadImport } from "@/components/LeadImport";
import { PageHeader, StatusBadge, EmptyState } from "@/components/patterns";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Postmark Studio" },
      {
        name: "description",
        content: "Add and manage the subscriber list for your email campaigns.",
      },
    ],
  }),
  component: LeadsPage,
});

const leadSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  name: z.string().trim().max(100).optional(),
});

type StatusFilter = "all" | "subscribed" | "unsubscribed";

function LeadsPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LeadSort>("created_desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const deferredSearch = useDeferredValue(search);
  const {
    data: pagedData,
    isLoading,
  } = useQuery(leadsPageQuery({ search: deferredSearch, sort, page }));
  const rawLeads = pagedData?.leads ?? [];
  const total = pagedData?.count ?? 0;

  const leads = rawLeads.filter((lead) => {
    if (statusFilter === "subscribed") return lead.subscribed;
    if (statusFilter === "unsubscribed") return !lead.subscribed;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE));

  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
  }, [deferredSearch, sort, statusFilter]);

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
      await createLead({ data: { email: parsed.email, name: parsed.name || undefined } });
    },
    onSuccess: () => {
      setEmail("");
      setName("");
      toast.success("Lead added successfully!");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof z.ZodError
          ? (err.issues[0]?.message ?? "Invalid input")
          : err instanceof Error
            ? err.message
            : "Something went wrong";
      toast.error(message);
    },
  });

  const toggleSubscribed = useMutation({
    mutationFn: async ({ lead, nextSubscribed }: { lead: Lead; nextSubscribed: boolean }) => {
      await setLeadSubscription({ data: { ids: [lead.id], subscribed: nextSubscribed } });
    },
    onMutate: async ({ lead, nextSubscribed }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const previous = qc.getQueryData(leadsPageQuery({ search: deferredSearch, sort, page }).queryKey);
      qc.setQueryData(
        leadsPageQuery({ search: deferredSearch, sort, page }).queryKey,
        (old: { leads: Lead[]; count: number } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            leads: old.leads.map((item) =>
              item.id === lead.id ? { ...item, subscribed: nextSubscribed } : item,
            ),
          };
        },
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(
          leadsPageQuery({ search: deferredSearch, sort, page }).queryKey,
          context.previous,
        );
      }
      toast.error("Failed to update status");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const bulkSubscriptionMutation = useMutation({
    mutationFn: async (subscribed: boolean) => {
      await setLeadSubscription({ data: { ids: Array.from(selectedIds), subscribed } });
    },
    onSuccess: (_data, subscribed) => {
      toast.success(`Updated ${selectedIds.size} lead(s) to ${subscribed ? "Subscribed" : "Unsubscribed"}`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      await deleteLeads({ data: { ids: Array.from(selectedIds) } });
    },
    onSuccess: () => {
      toast.success(`Deleted ${selectedIds.size} lead(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    },
  });

  const exportCsv = async () => {
    const exportLeads = await qc.fetchQuery({
      queryKey: ["leads", "export", deferredSearch],
      queryFn: () => fetchLeads({ data: { search: deferredSearch } }),
    });
    if (exportLeads.length === 0) {
      toast.error("No leads to export.");
      return;
    }
    const escape = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const rows = [
      ["email", "name", "subscribed", "created_at"],
      ...exportLeads.map((lead) => [
        lead.email,
        lead.name ?? "",
        lead.subscribed ? "true" : "false",
        lead.created_at,
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportLeads.length} lead(s)`);
  };

  const allOnPageSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads & Audience"
        description={`${total} ${deferredSearch ? "matching" : "total"} subscriber${total === 1 ? "" : "s"} in list.`}
        actions={
          <Button type="button" variant="outline" onClick={exportCsv} className="h-9 text-xs" aria-label="Export CSV">
            <Download className="size-3.5 mr-1.5" /> Export CSV
          </Button>
        }
      />

      {/* Add Lead Form */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 shadow-xs">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            addLead.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              maxLength={255}
              placeholder="subscriber@example.com"
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-10 text-sm bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-semibold">Full Name (Optional)</Label>
            <Input
              id="name"
              value={name}
              maxLength={100}
              placeholder="Jane Doe"
              onChange={(event) => setName(event.target.value)}
              className="h-10 text-sm bg-card"
            />
          </div>
          <Button type="submit" disabled={addLead.isPending} className="h-10 shadow-xs" aria-label="Add lead to list">
            <UserPlus className="size-4 mr-1.5" />
            {addLead.isPending ? "Adding…" : "Add Lead"}
          </Button>
        </form>
      </div>

      <LeadImport />

      {/* Leads Table Container */}
      <div className="glass-panel rounded-xl p-5 border border-border/80 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email or name…"
                aria-label="Search email or name"
                className="pl-9 pr-8 h-9 text-xs bg-card"
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Quick Status Filter Pills */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/80 text-xs">
              <Button
                type="button"
                variant={statusFilter === "all" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                type="button"
                variant={statusFilter === "subscribed" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={() => setStatusFilter("subscribed")}
              >
                Subscribed
              </Button>
              <Button
                type="button"
                variant={statusFilter === "unsubscribed" ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs font-semibold"
                onClick={() => setStatusFilter("unsubscribed")}
              >
                Suppressed
              </Button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as LeadSort)}
              aria-label="Sort leads by"
              className="h-9 rounded-md border border-input bg-card px-3 text-xs font-medium text-foreground cursor-pointer"
            >
              <option value="created_desc">Newest Added</option>
              <option value="email_asc">Email A–Z</option>
              <option value="email_desc">Email Z–A</option>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
            </select>
          </label>
        </div>

        {/* Floating Bulk-Action Bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-card/95 backdrop-blur-md border border-border p-2.5 px-5 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-4">
            <span className="text-xs font-bold text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSubscriptionMutation.mutate(true)}
              disabled={bulkSubscriptionMutation.isPending}
              className="h-8 text-xs font-semibold"
              aria-label="Resubscribe selected leads"
            >
              <UserCheck className="size-3.5 mr-1 text-success" /> Resubscribe
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkSubscriptionMutation.mutate(false)}
              disabled={bulkSubscriptionMutation.isPending}
              className="h-8 text-xs font-semibold"
              aria-label="Unsubscribe selected leads"
            >
              <UserX className="size-3.5 mr-1 text-warning" /> Suppress
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => bulkDeleteMutation.mutate()}
              disabled={bulkDeleteMutation.isPending}
              className="h-8 text-xs font-semibold"
              aria-label="Delete selected leads"
            >
              <Trash2 className="size-3.5 mr-1" /> Delete
            </Button>
          </div>
        )}

        {isLoading ? (
          <SkeletonTable rows={5} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/80">
            <table className="w-full text-sm">
              <thead className="border-b border-border/80 bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th className="w-10 px-3 py-3.5 text-center">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all leads on page"
                    />
                  </th>
                  <th className="px-4 py-3.5">Email / Name</th>
                  <th className="px-4 py-3.5">Suppression Status</th>
                  <th className="px-4 py-3.5">Added Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <EmptyState
                        icon={Users}
                        title="No Subscriber Leads Found"
                        description="Add your first lead using the form above or import a CSV file."
                        className="border-none rounded-none glass-panel shadow-none py-12"
                      />
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => {
                    const isSelected = selectedIds.has(lead.id);
                    return (
                      <tr
                        key={lead.id}
                        className={`hover:bg-accent/40 transition-colors ${isSelected ? "bg-accent/60" : ""}`}
                      >
                        <td className="px-3 py-3.5 text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelectOne(lead.id)}
                            aria-label={`Select lead ${lead.email}`}
                          />
                        </td>
                        <td className="px-4 py-3.5 font-medium">
                          <div className="text-foreground font-semibold">{lead.email}</div>
                          {lead.name && <div className="text-xs text-muted-foreground">{lead.name}</div>}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <Switch
                              checked={lead.subscribed}
                              onCheckedChange={(checked) =>
                                toggleSubscribed.mutate({ lead, nextSubscribed: checked })
                              }
                              aria-label={`Toggle subscription for ${lead.email}`}
                            />
                            <StatusBadge
                              status={lead.subscribed ? "active" : "suppressed"}
                              label={lead.subscribed ? "Subscribed" : "Suppressed"}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setSelectedIds(new Set([lead.id]));
                              bulkDeleteMutation.mutate();
                            }}
                            title="Delete Lead"
                            aria-label={`Delete lead ${lead.email}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 text-xs"
                aria-label="Previous leads page"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 text-xs"
                aria-label="Next leads page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
