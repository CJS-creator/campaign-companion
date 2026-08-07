import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { leadsQuery, type Lead } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { LeadImport } from "@/components/LeadImport";


export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Postmark Studio" },
      {
        name: "description",
        content: "Add and manage the subscriber list for your email campaigns.",
      },
      { property: "og:title", content: "Leads — Postmark Studio" },
      {
        property: "og:description",
        content: "Add and manage the subscriber list for your email campaigns.",
      },
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
  const { data: leads = [], isLoading } = useQuery(leadsQuery);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  const addLead = useMutation({
    mutationFn: async () => {
      const parsed = leadSchema.parse({ email, name });
      const { error } = await supabase
        .from("leads")
        .insert({ email: parsed.email.toLowerCase(), name: parsed.name || null });
      if (error) {
        throw new Error(
          error.code === "23505" ? "That email is already on the list." : error.message,
        );
      }
    },
    onSuccess: () => {
      setEmail("");
      setName("");
      toast.success("Lead added");
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
    mutationFn: async (lead: Lead) => {
      const { error } = await supabase
        .from("leads")
        .update({ subscribed: !lead.subscribed })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
    onError: () => toast.error("Could not update lead"),
  });

  const subscribedCount = leads.filter((l) => l.subscribed).length;

  const exportCsv = () => {
    if (leads.length === 0) {
      toast.info("No leads to export yet");
      return;
    }
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const rows = [
      ["email", "name", "subscribed", "created_at"],
      ...leads.map((l) => [
        l.email,
        l.name ?? "",
        l.subscribed ? "true" : "false",
        l.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => escape(String(cell))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${leads.length} ${leads.length === 1 ? "lead" : "leads"}`);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {leads.length} total · {subscribedCount} subscribed
          </p>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </header>


      <Card className="p-5">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addLead.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              maxLength={255}
              placeholder="jane@example.com"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              maxLength={100}
              placeholder="Jane Doe"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={addLead.isPending}>
            {addLead.isPending ? "Adding…" : "Add lead"}
          </Button>
        </form>
      </Card>

      <LeadImport />


      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Added</th>
              <th className="px-5 py-3 text-right font-medium">Subscribed</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && leads.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                  No leads yet. Add your first one above.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">{lead.email}</td>
                <td className="px-5 py-3 text-muted-foreground">{lead.name ?? "—"}</td>
                <td className="px-5 py-3 text-muted-foreground">
                  {new Date(lead.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3 text-right">
                  <Switch
                    checked={lead.subscribed}
                    onCheckedChange={() => toggleSubscribed.mutate(lead)}
                    aria-label={`Toggle subscription for ${lead.email}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
