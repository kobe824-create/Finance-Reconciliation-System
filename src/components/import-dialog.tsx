"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, FileText, LoaderCircle, Plus, UploadCloud, X } from "lucide-react";
import { fileToBase64, parseStatementFile, sha256File, type ParseResult } from "@/lib/import-parsers";
import type { Account, TransactionSource } from "@/lib/types";

export type PreparedImport = { file: File; parsed: ParseResult; source: TransactionSource; sha256: string; contentBase64: string };
export type ImportSubmission = { accountId: string; periodStart: string; periodEnd: string; statementBalance: number; bookBalance: number; files: PreparedImport[] };

type Props = { accounts: Account[]; onClose: () => void; onSave: (submission: ImportSubmission) => Promise<void> };
type DraftFile = { file: File; parsed?: ParseResult; source: TransactionSource; sha256?: string; contentBase64?: string; error?: string; loading: boolean };

const money = (amount: number, currency: string) => new Intl.NumberFormat("en-RW", { style: "currency", currency, maximumFractionDigits: currency === "RWF" ? 0 : 2 }).format(amount);
const dateToday = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const monthStart = () => `${dateToday().slice(0, 7)}-01`;
const monthEnd = () => {
  const [year, month] = dateToday().slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function ImportDialog({ accounts, onClose, onSave }: Props) {
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState(accounts.find((item) => item.active)?.id ?? "");
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(monthEnd());
  const [statementBalance, setStatementBalance] = useState("");
  const [bookBalance, setBookBalance] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const account = accounts.find((item) => item.id === accountId);

  async function addFiles(input: FileList | null) {
    if (!input) return;
    const nextFiles: DraftFile[] = [...input].map((file, index) => ({
      file,
      source: /ledger|cashbook|general.?ledger/i.test(file.name) ? "ledger" : files.length + index === 0 ? "bank" : "ledger",
      loading: true,
    }));
    setError("");
    setFiles((current) => [...current, ...nextFiles]);
    for (const item of nextFiles) {
      try {
        const [parsed, sha256, contentBase64] = await Promise.all([parseStatementFile(item.file), sha256File(item.file), fileToBase64(item.file)]);
        setFiles((current) => current.map((file) => file.file === item.file ? { ...file, parsed, sha256, contentBase64, loading: false } : file));
      } catch (cause) {
        setFiles((current) => current.map((file) => file.file === item.file ? { ...file, error: cause instanceof Error ? cause.message : "This file could not be read.", loading: false } : file));
      }
    }
  }

  function setSource(file: File, source: TransactionSource) {
    setFiles((current) => current.map((item) => item.file === file ? { ...item, source } : item));
  }

  function removeFile(file: File) {
    setFiles((current) => current.filter((item) => item.file !== file));
  }

  async function save() {
    const readyFiles = files.filter((file): file is DraftFile & { parsed: ParseResult; sha256: string; contentBase64: string } => !!file.parsed && !!file.sha256 && !!file.contentBase64 && !file.error);
    if (!readyFiles.length) { setError("Add at least one readable statement file."); return; }
    if (readyFiles.reduce((sum, file) => sum + file.parsed.rows.length, 0) > 10000) { setError("This reconciliation is limited to 10,000 parsed transaction rows per import. Split it into smaller periods."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ accountId, periodStart, periodEnd, statementBalance: Number(statementBalance), bookBalance: Number(bookBalance), files: readyFiles.map((file) => ({ file: file.file, parsed: file.parsed, source: file.source, sha256: file.sha256, contentBase64: file.contentBase64 })) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The import could not be saved.");
      setSaving(false);
    }
  }

  function continueToFiles(event: FormEvent) {
    event.preventDefault();
    if (!accountId || !periodStart || !periodEnd || periodStart > periodEnd || !statementBalance || !bookBalance) {
      setError("Choose an account and period, then enter both closing balances.");
      return;
    }
    setError("");
    setStep(2);
  }

  const busyFiles = files.some((file) => file.loading);
  const totalRows = files.reduce((sum, file) => sum + (file.parsed?.rows.length ?? 0), 0);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="modal-head">
          <div>
            <h2 id="import-title">New reconciliation</h2>
            <p>Bring the statement and ledger together for review.</p>
          </div>
          <button className="icon-button" aria-label="Close" onClick={onClose} disabled={saving}><X size={16} /></button>
        </div>
        <div className="modal-body">
          <div className="step-indicator" style={{ marginBottom: 18 }}>
            <span className={`step-dot ${step === 1 ? "active" : ""}`}>1</span><span>Period and balance</span><ArrowRight size={12} />
            <span className={`step-dot ${step === 2 ? "active" : ""}`}>2</span><span>Source statements</span>
          </div>
          {step === 1 ? (
            <form onSubmit={continueToFiles}>
              <div className="field-grid">
                <div className="field full"><label htmlFor="recon-account">Bank account</label><select id="recon-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                  <option value="">Choose an account</option>{accounts.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.institution}</option>)}
                </select></div>
                <div className="field"><label htmlFor="period-start">Period begins</label><input id="period-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></div>
                <div className="field"><label htmlFor="period-end">Statement through</label><input id="period-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></div>
                <div className="field"><label htmlFor="statement-balance">Closing balance · statement ({account?.currency ?? "RWF"})</label><input id="statement-balance" type="number" step="0.01" value={statementBalance} onChange={(event) => setStatementBalance(event.target.value)} placeholder="0.00" required /></div>
                <div className="field"><label htmlFor="book-balance">Closing balance · ledger ({account?.currency ?? "RWF"})</label><input id="book-balance" type="number" step="0.01" value={bookBalance} onChange={(event) => setBookBalance(event.target.value)} placeholder="0.00" required /></div>
                <div className="field full"><div className="callout"><AlertCircle size={15} /><span>Enter closing balances from the same period end. The reviewer can approve only when the balances agree and all transactions are matched.</span></div></div>
              </div>
              <div className="modal-footer" style={{ margin: "18px -21px -19px" }}>
                <span className="muted" style={{ fontSize: 9 }}>Step 1 of 2</span><div className="modal-footer-right"><button className="btn btn-primary" type="submit">Continue to statements <ArrowRight size={13} /></button></div>
              </div>
            </form>
          ) : (
            <>
              <div className="callout" style={{ marginBottom: 14 }}><FileText size={15} /><span>{account?.name} · {periodStart} to {periodEnd} · statement {money(Number(statementBalance), account?.currency ?? "RWF")}</span></div>
              <label className="upload-drop">
                <input type="file" multiple accept=".csv,.xlsx,.pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => { void addFiles(event.target.files); event.target.value = ""; }} />
                <div><UploadCloud size={20} /><strong>Select statement files</strong><small>CSV, Excel workbook, or text-based PDF · up to 2.5 MB per file</small></div>
              </label>
              {files.length > 0 && <div style={{ marginTop: 13 }}>
                <div className="subsection-title"><span>Files in this import · {totalRows.toLocaleString()} rows</span><span>{files.length} file{files.length === 1 ? "" : "s"}</span></div>
                {files.map((item) => <div key={`${item.file.name}-${item.file.lastModified}`}>
                  <div className="file-row">
                    <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="detail-icon" style={{ width: 27, height: 27 }}>{item.file.name.toLowerCase().endsWith(".csv") || item.file.name.toLowerCase().endsWith(".xlsx") ? <FileSpreadsheet size={13} /> : <FileText size={13} />}</span>
                      <div style={{ minWidth: 0 }}><div className="file-name">{item.file.name}</div><div className="file-meta">{fileSize(item.file.size)}{item.parsed ? ` · ${item.parsed.rows.length} transactions` : item.error ? " · Could not read" : " · Reading file"}</div></div>
                    </div>
                    <select className="file-source" aria-label={`Source side for ${item.file.name}`} value={item.source} onChange={(event) => setSource(item.file, event.target.value as TransactionSource)}><option value="bank">Bank</option><option value="ledger">Ledger</option></select>
                    <span className="file-meta-count">{item.loading ? <LoaderCircle className="spin" size={14} /> : item.error ? <AlertCircle color="#b84e4e" size={14} /> : <CheckCircle2 color="#2e7a60" size={14} />}</span>
                    <button className="icon-button" style={{ width: 25, height: 25 }} aria-label={`Remove ${item.file.name}`} onClick={() => removeFile(item.file)}><X size={13} /></button>
                  </div>
                  {item.error && <div className="parse-warning">{item.error}</div>}
                  {item.parsed?.warnings.map((warning, index) => <div className="parse-warning" key={index}>{warning}</div>)}
                  {item.parsed && item.parsed.rows.length > 0 && <div className="preview-table"><table><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="amount-cell">Amount</th></tr></thead><tbody>{item.parsed.rows.slice(0, 3).map((row, index) => <tr key={`${row.date}-${index}`}><td>{row.date}</td><td>{row.description}</td><td>{row.reference || "—"}</td><td className="amount-cell">{money(row.amount, account?.currency ?? "RWF")}</td></tr>)}</tbody></table></div>}
                </div>)}
              </div>}
              <div className="callout warning" style={{ marginTop: 13 }}><AlertCircle size={15} /><span>The original files and normalized transaction rows are retained in Neon when the database is configured. Imports are capped at 2.5 MB per file and 5,000 rows per file.</span></div>
              <div className="modal-footer" style={{ margin: "18px -21px -19px" }}>
                <button className="btn btn-quiet" onClick={() => { setStep(1); setError(""); }} disabled={saving}><ArrowLeft size={13} /> Back</button>
                <div className="modal-footer-right"><button className="btn" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" onClick={() => void save()} disabled={saving || busyFiles || !files.some((file) => file.parsed && !file.error)}>{saving ? <><LoaderCircle className="spin" size={13} /> Saving…</> : <><Plus size={13} /> Create and reconcile</>}</button></div>
              </div>
            </>
          )}
          {error && <div className="notice error" style={{ position: "static", marginTop: 14, maxWidth: "none", boxShadow: "none" }}><AlertCircle size={14} />{error}</div>}
        </div>
      </section>
    </div>
  );
}
