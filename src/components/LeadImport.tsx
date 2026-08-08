import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  ArrowRight,
  Eye,
} from "lucide-react";
import { previewLeadImport, importLeads, type LeadImportPreviewResult } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<LeadImportPreviewResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.aoa_to_sheet([
      ["email", "name"],
      ["jane@example.com", "Jane Doe"],
      ["sam@example.com", "Sam Patel"],
      ["alex@example.com", "Alex Chen"],
    ]);
    sheet["!cols"] = [{ wch: 32 }, { wch: 24 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Leads");
    XLSX.writeFile(book, "leads-import-template.xlsx");
  };

  const handleFileSelect = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const first = book.SheetNames[0];
      if (!first) throw new Error("That file has no sheets.");

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[first]!, {
        defval: "",
      });
      if (rows.length === 0) throw new Error("No data rows found in spreadsheet.");

      const rawRows: Array<{ email: string; name: string | null }> = [];
      rows.forEach((row) => {
        const email = pick(row, ["email", "e-mail", "email address", "mail"]);
        const name = pick(row, ["name", "full name", "first name", "lead name"]);
        rawRows.push({ email, name: name || null });
      });

      // Fetch duplicate & validity preview from server
      const result = await previewLeadImport({ data: { rows: rawRows } });
      setPreviewData(result);
      setShowPreviewModal(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that spreadsheet file");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!previewData || previewData.newLeads.length === 0) {
      toast.info("No new leads to import");
      setShowPreviewModal(false);
      return;
    }

    setImporting(true);
    try {
      const result = await importLeads({
        data: { rows: previewData.newLeads },
      });
      toast.success(
        `Successfully imported ${result.added} new lead${result.added === 1 ? "" : "s"}!`,
      );
      qc.invalidateQueries({ queryKey: ["leads"] });
      setShowPreviewModal(false);
      setPreviewData(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lead import failed");
    } finally {
      setImporting(false);
    }
  };

  const totalDuplicates =
    (previewData?.dbDuplicates.length || 0) + (previewData?.fileDuplicates.length || 0);

  return (
    <>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-primary" />
              Import leads from CSV / Excel
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a file containing{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">email</code> and
              optional <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">name</code>{" "}
              columns. You will preview duplicates before saving.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4 mr-1.5" />
              Template
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <Upload className="size-4 mr-1.5" />
              )}
              {busy ? "Parsing file…" : "Upload CSV / Excel"}
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
            if (file) void handleFileSelect(file);
          }}
        />
      </Card>

      {/* Duplicate & Lead Import Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Eye className="size-5 text-primary" />
              Import Preview & Duplicate Audit
            </DialogTitle>
            <DialogDescription>
              Review new leads, duplicates, and invalid entries before confirming the import.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
              {/* Summary Cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-3 bg-emerald-500/5 border-emerald-500/30 flex items-center gap-3">
                  <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-2xl font-bold text-emerald-700">
                      {previewData.newLeads.length}
                    </div>
                    <div className="text-xs font-medium text-emerald-600">New Leads to Add</div>
                  </div>
                </Card>

                <Card className="p-3 bg-amber-500/5 border-amber-500/30 flex items-center gap-3">
                  <AlertTriangle className="size-5 text-amber-600 shrink-0" />
                  <div>
                    <div className="text-2xl font-bold text-amber-700">{totalDuplicates}</div>
                    <div className="text-xs font-medium text-amber-600">Duplicates Detected</div>
                  </div>
                </Card>

                <Card className="p-3 bg-destructive/5 border-destructive/30 flex items-center gap-3">
                  <XCircle className="size-5 text-destructive shrink-0" />
                  <div>
                    <div className="text-2xl font-bold text-destructive">
                      {previewData.invalidRows.length}
                    </div>
                    <div className="text-xs font-medium text-destructive">
                      Invalid / Skipped Rows
                    </div>
                  </div>
                </Card>
              </div>

              {/* Tabs view of parsed categories */}
              <Tabs defaultValue="new" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="new" className="text-xs">
                    New Leads ({previewData.newLeads.length})
                  </TabsTrigger>
                  <TabsTrigger value="duplicates" className="text-xs">
                    Duplicates ({totalDuplicates})
                  </TabsTrigger>
                  <TabsTrigger value="invalid" className="text-xs">
                    Invalid ({previewData.invalidRows.length})
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: New Leads */}
                <TabsContent value="new" className="mt-3">
                  <div className="rounded-md border max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="border-b bg-muted/50 font-medium sticky top-0">
                        <tr>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.newLeads.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-muted-foreground">
                              No new leads found in file.
                            </td>
                          </tr>
                        ) : (
                          previewData.newLeads.map((lead, idx) => (
                            <tr key={idx} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="p-2.5 font-medium">{lead.email}</td>
                              <td className="p-2.5 text-muted-foreground">{lead.name || "—"}</td>
                              <td className="p-2.5 text-right">
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                                >
                                  Ready
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Tab 2: Duplicates */}
                <TabsContent value="duplicates" className="mt-3">
                  <div className="rounded-md border max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="border-b bg-muted/50 font-medium sticky top-0">
                        <tr>
                          <th className="p-2.5">Email</th>
                          <th className="p-2.5">Name</th>
                          <th className="p-2.5">Duplicate Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {totalDuplicates === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-muted-foreground">
                              No duplicate leads detected!
                            </td>
                          </tr>
                        ) : (
                          <>
                            {previewData.dbDuplicates.map((dup, idx) => (
                              <tr
                                key={`db_${idx}`}
                                className="border-b hover:bg-muted/20 bg-amber-500/5"
                              >
                                <td className="p-2.5 font-medium">{dup.email}</td>
                                <td className="p-2.5 text-muted-foreground">{dup.name || "—"}</td>
                                <td className="p-2.5">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 text-amber-700"
                                  >
                                    Already on subscriber list
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                            {previewData.fileDuplicates.map((dup, idx) => (
                              <tr
                                key={`file_${idx}`}
                                className="border-b last:border-0 hover:bg-muted/20 bg-amber-500/5"
                              >
                                <td className="p-2.5 font-medium">{dup.email}</td>
                                <td className="p-2.5 text-muted-foreground">{dup.name || "—"}</td>
                                <td className="p-2.5">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 text-amber-700"
                                  >
                                    Repeated in file (Row {dup.firstRow})
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>

                {/* Tab 3: Invalid Rows */}
                <TabsContent value="invalid" className="mt-3">
                  <div className="rounded-md border max-h-60 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="border-b bg-muted/50 font-medium sticky top-0">
                        <tr>
                          <th className="p-2.5">Row #</th>
                          <th className="p-2.5">Value</th>
                          <th className="p-2.5">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.invalidRows.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-muted-foreground">
                              No invalid rows found!
                            </td>
                          </tr>
                        ) : (
                          previewData.invalidRows.map((inv, idx) => (
                            <tr
                              key={idx}
                              className="border-b last:border-0 hover:bg-muted/20 bg-destructive/5"
                            >
                              <td className="p-2.5 font-mono">Row {inv.row}</td>
                              <td className="p-2.5 font-medium max-w-xs truncate">
                                {inv.email || "(empty)"}
                              </td>
                              <td className="p-2.5 text-destructive font-medium">{inv.reason}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter className="border-t pt-3 shrink-0 flex flex-row items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setShowPreviewModal(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmImport}
              disabled={importing || !previewData || previewData.newLeads.length === 0}
            >
              {importing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Saving leads…
                </>
              ) : (
                <>
                  Import {previewData?.newLeads.length || 0} New Lead
                  {previewData?.newLeads.length === 1 ? "" : "s"}
                  <ArrowRight className="size-4 ml-1.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
