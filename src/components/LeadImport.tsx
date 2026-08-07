import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload, Loader2 } from "lucide-react";
import { z } from "zod";
import { importLeads } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const rowSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().max(100).optional(),
});

type ImportSummary = {
  added: number;
  duplicates: number;
  invalid: { row: number; reason: string }[];
};

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const key of Object.keys(row)) {
    if (keys.includes(key.trim().toLowerCase())) {
      const value = row[key];
      if (value !== undefined && value !== null) return String(value).trim();
    }
  }
  return "";
}

export function LeadImport() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["email", "name"],
      ["jane@example.com", "Jane Doe"],
      ["sam@example.com", "Sam Patel"],
    ]);
    sheet["!cols"] = [{ wch: 32 }, { wch: 24 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Leads");
    XLSX.writeFile(book, "leads-template.xlsx");
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setSummary(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const first = book.SheetNames[0];
      if (!first) throw new Error("That file has no sheets.");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[first]!, {
        defval: "",
      });
      if (rows.length === 0) throw new Error("No rows found in the first sheet.");

      const invalid: ImportSummary["invalid"] = [];
      const seen = new Set<string>();
      const valid: { email: string; name: string | null }[] = [];

      rows.forEach((row, i) => {
        const email = pick(row, ["email", "e-mail", "email address", "mail"]);
        const name = pick(row, ["name", "full name", "first name", "lead name"]);
        if (!email) {
          invalid.push({ row: i + 2, reason: "Missing email" });
          return;
        }
        const parsed = rowSchema.safeParse({ email, name: name || undefined });
        if (!parsed.success) {
          invalid.push({ row: i + 2, reason: "Invalid email" });
          return;
        }
        const key = parsed.data.email.toLowerCase();
        if (seen.has(key)) {
          invalid.push({ row: i + 2, reason: "Duplicate in file" });
          return;
        }
        seen.add(key);
        valid.push({ email: key, name: parsed.data.name || null });
      });

      let added = 0;
      let duplicates = 0;

      if (valid.length > 0) {
        const result = await importLeads({ data: { rows: valid } });
        added = result.added;
        duplicates = result.duplicates;
      }

      setSummary({ added, duplicates, invalid });
      qc.invalidateQueries({ queryKey: ["leads"] });
      if (added > 0) toast.success(`Imported ${added} ${added === 1 ? "lead" : "leads"}`);
      else toast.info("No new leads were added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">Import from a spreadsheet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload an Excel or CSV file with <code className="rounded bg-muted px-1">email</code>{" "}
            and <code className="rounded bg-muted px-1">name</code> columns. Start from the
            template if you don't have one.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="size-4" />
            Template
          </Button>
          <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy ? "Importing…" : "Upload file"}
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {summary && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium">
            {summary.added} added · {summary.duplicates} already on the list ·{" "}
            {summary.invalid.length} skipped
          </p>
          {summary.invalid.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {summary.invalid.slice(0, 8).map((issue, i) => (
                <li key={i}>
                  Row {issue.row}: {issue.reason}
                </li>
              ))}
              {summary.invalid.length > 8 && <li>…and {summary.invalid.length - 8} more</li>}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
