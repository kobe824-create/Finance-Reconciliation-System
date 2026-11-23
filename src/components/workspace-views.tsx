"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertCircle, ArrowDownToLine, ArrowRight, ArrowUpRight, Banknote, BookOpenCheck, Check, CheckCircle2, ChevronDown, ClipboardCheck, FileDown, FileSearch, FileText, Filter, LockKeyhole, Plus, Printer, RefreshCw, Search, ShieldCheck, Sparkles, Users, WalletCards, X } from "lucide-react";
import type { AppUser, Reconciliation, ReconciliationStatus, SourceFile, StatementTransaction, UserRole, WorkspaceData } from "@/lib/types";

export type ViewKey = "overview" | "reconciliations" | "imports" | "exceptions" | "reports" | "audit" | "team";
export type WorkflowAction = "submit" | "approve" | "return";
export type CreateUserPayload = { name: string; email: string; role: UserRole; password: string };
export type CreateAccountPayload = { name: string; institution: string; currency: string; accountNumber: string };

type BaseProps = { data: WorkspaceData; user: AppUser; onOpenReconciliation: (id: string) => void; onNewImport: () => void };
type ReconciliationProps = BaseProps & { searchText?: string };
type ExceptionProps = BaseProps & { selectedReconciliationId?: string; onAutoMatch: (id: string) => Promise<void>; onManualMatch: (id: string, bank: StatementTransaction, ledger: StatementTransaction) => Promise<void>; onWorkflow: (id: string, action: WorkflowAction, note?: string) => Promise<void> };
type FileProps = BaseProps & { databaseConfigured: boolean; onDownloadFile: (file: SourceFile) => void };
type ReportProps = BaseProps & { onExport: (rows: Reconciliation[]) => void };
type AuditProps = { data: WorkspaceData; user: AppUser; onOpenReconciliation: (id: string) => void };
type TeamProps = { data: WorkspaceData; user: AppUser; onCreateUser: (user: CreateUserPayload) => Promise<void>; onCreateAccount: (account: CreateAccountPayload) => Promise<void>; onUpdateUser: (user: AppUser) => Promise<void> };

const currency = (amount: number, code = "RWF") => {
  try { return new Intl.NumberFormat("en-RW", { style: "currency", currency: code, maximumFractionDigits: code === "RWF" ? 0 : 2 }).format(amount); }
  catch { return `${code} ${amount.toLocaleString()}`; }
};
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const monthLabel = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const rangeLabel = (recon: Reconciliation) => `${dateLabel(recon.periodStart)} — ${dateLabel(recon.periodEnd)}`;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const humanStatus: Record<ReconciliationStatus, string> = { draft: "In progress", in_review: "In review", approved: "Approved", needs_attention: "Needs attention" };
const roleLabel: Record<UserRole, string> = { admin: "Administrator", preparer: "Preparer", reviewer: "Reviewer", auditor: "Auditor" };
const openCount = (recon: Reconciliation) => recon.unmatchedBankCount + recon.unmatchedLedgerCount;

function StatusBadge({ status }: { status: ReconciliationStatus }) {
  return <span className={`status ${status}`}>{humanStatus[status]}</span>;
}

function Heading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="section-head"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

function SummaryTable({ rows, onOpen, compact = false }: { rows: Reconciliation[]; onOpen: (id: string) => void; compact?: boolean }) {
  return <div className="table-scroll"><table style={{ minWidth: compact ? 680 : 880 }}><thead><tr><th>Account</th><th>Period</th><th>Status</th><th className="amount-cell">Statement balance</th><th className="amount-cell">Difference</th><th>Open items</th><th /></tr></thead><tbody>
    {rows.map((recon) => <tr key={recon.id}>
      <td><div className="primary-cell">{recon.accountName}</div><div className="secondary-cell">{recon.institution}</div></td>
      <td>{rangeLabel(recon)}</td><td><StatusBadge status={recon.status} /></td>
      <td className="amount-cell">{currency(recon.statementBalance, recon.currency)}</td>
      <td className="amount-cell" style={{ color: recon.difference === 0 ? "#39785f" : "#a46c28" }}>{currency(recon.difference, recon.currency)}</td>
      <td>{openCount(recon) ? <span style={{ color: "#a46c28", fontWeight: 700 }}>{openCount(recon)}</span> : <span style={{ color: "#438064" }}>—</span>}</td>
      <td><button className="table-action" onClick={() => onOpen(recon.id)}>{recon.status === "in_review" ? "Review" : "Open"} <ArrowRight size={11} style={{ verticalAlign: "-2px" }} /></button></td>
    </tr>)}
    {!rows.length && <tr><td colSpan={7}><div className="empty-state"><strong>No reconciliations found</strong>Try changing the search or filters.</div></td></tr>}
  </tbody></table></div>;
}

export function OverviewView({ data, user, onOpenReconciliation, onNewImport }: BaseProps) {
  const recent = [...data.reconciliations].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.updatedAt.localeCompare(a.updatedAt));
  const activeAccounts = data.accounts.filter((account) => account.active).length;
  const matched = recent.reduce((sum, recon) => sum + recon.matchedCount, 0);
  const openItems = recent.reduce((sum, recon) => sum + openCount(recon), 0);
  const inReview = recent.filter((recon) => recon.status === "in_review").length;
  const attention = recent.filter((recon) => openCount(recon) > 0 || recon.status === "in_review").slice(0, 3);
  const chartRows = (() => {
    const now = new Date();
    const months: Array<{ key: string; month: string; matched: number; open: number }> = [];
    for (let offset = 4; offset >= 0; offset--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      const monthRecs = recent.filter((recon) => recon.periodEnd.startsWith(key));
      months.push({ key, month: monthDate.toLocaleDateString("en-GB", { month: "short" }), matched: monthRecs.reduce((sum, recon) => sum + recon.matchedCount, 0), open: monthRecs.reduce((sum, recon) => sum + openCount(recon), 0) });
    }
    if (!months.some((item) => item.matched || item.open)) return [
      { key: "1", month: "Jul", matched: 39, open: 4 }, { key: "2", month: "Aug", matched: 45, open: 3 }, { key: "3", month: "Sep", matched: 52, open: 0 }, { key: "4", month: "Oct", matched: 78, open: 2 }, { key: "5", month: "Nov", matched: 18, open: 3 },
    ];
    return months;
  })();
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const currentDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(new Date());
  return <>
    <Heading eyebrow="Finance workspace · DDIN" title={`${greeting}, ${user.name.split(" ")[0]}`} description={`Here is the close activity as of ${currentDate}.`} actions={<><button className="btn" onClick={() => onOpenReconciliation(recent[0]?.id ?? "")} disabled={!recent.length}><FileSearch size={14} /> View history</button><button className="btn btn-primary" onClick={onNewImport}><Plus size={14} /> New reconciliation</button></>} />
    <div className="stats-grid">
      <div className="card stat-card"><div className="stat-top"><span>Active accounts</span><span className="stat-icon"><WalletCards size={14} /></span></div><div className="stat-value">{String(activeAccounts).padStart(2, "0")}</div><div className="stat-foot">Configured for monthly close</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Matched transactions</span><span className="stat-icon"><BookOpenCheck size={14} /></span></div><div className="stat-value">{matched.toLocaleString()}</div><div className="stat-foot"><span className="positive">Across the available periods</span></div></div>
      <div className="card stat-card"><div className="stat-top"><span>Open items</span><span className="stat-icon" style={{ background: "#fff5e9", color: "#bd7927" }}><AlertCircle size={14} /></span></div><div className="stat-value">{openItems.toLocaleString()}</div><div className="stat-foot">Outstanding across all periods</div></div>
      <div className="card stat-card"><div className="stat-top"><span>Awaiting review</span><span className="stat-icon"><ClipboardCheck size={14} /></span></div><div className="stat-value">{String(inReview).padStart(2, "0")}</div><div className="stat-foot">Reviewer action required</div></div>
    </div>
    <div className="dashboard-grid">
      <section className="card card-pad chart-card">
        <div className="card-heading"><div><div className="card-title">Monthly close activity</div><div className="card-subtitle">Transactions matched and open items by statement period</div></div><span className="period-select">Last 5 periods <ChevronDown size={11} style={{ verticalAlign: "-2px" }} /></span></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartRows} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
          <defs><linearGradient id="matchedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#526b9d" stopOpacity={0.15} /><stop offset="95%" stopColor="#526b9d" stopOpacity={0.01} /></linearGradient></defs>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#929aaa", fontSize: 9 }} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#a0a7b4", fontSize: 8 }} width={32} />
          <Tooltip contentStyle={{ border: "1px solid #e7eaf0", borderRadius: 5, fontSize: 10, boxShadow: "0 5px 18px rgba(20,30,50,.08)" }} />
          <Area type="monotone" dataKey="matched" name="Matched transactions" stroke="#536b99" strokeWidth={2} fill="url(#matchedFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
          <Area type="monotone" dataKey="open" name="Open items" stroke="#d88a2d" strokeWidth={1.5} fill="transparent" activeDot={{ r: 3, strokeWidth: 0 }} />
        </AreaChart></ResponsiveContainer></div>
        <div className="chart-foot"><span>Statement period</span><span className="chart-legend"><span><i className="legend-dot" />Matched</span><span><i className="legend-dot light" />Open items</span></span></div>
      </section>
      <section className="card card-pad attention-card">
        <div className="card-heading"><div><div className="card-title">Attention required</div><div className="card-subtitle">Exceptions and items ready for review</div></div><button className="link-button" onClick={() => onOpenReconciliation(attention[0]?.id ?? "")}>View queue <ArrowRight size={11} /></button></div>
        <div className="attention-summary"><div className="attention-number">{openItems}</div><div className="attention-copy"><strong>Outstanding transactions</strong>Open items need an explanation or a manual match.</div></div>
        <div style={{ marginTop: 8 }}>{attention.slice(0, 3).map((recon) => <div className="attention-row" key={recon.id}>
          <div><div className="attention-name">{recon.accountName}</div><div className="attention-meta">{monthLabel(recon.periodEnd)} · {recon.status === "in_review" ? "Review pending" : `${openCount(recon)} open items`}</div></div>
          <div className="attention-amount">{recon.difference ? currency(recon.difference, recon.currency) : <StatusBadge status={recon.status} />}</div>
        </div>)}</div>
      </section>
    </div>
    <section className="card section-card"><SectionHeading title="Recent reconciliations" description="Latest statement periods across DDIN accounts" action={<button className="link-button" onClick={() => onOpenReconciliation(recent[0]?.id ?? "")}>All reconciliations <ArrowRight size={11} /></button>} /><SummaryTable rows={recent.slice(0, 5)} onOpen={onOpenReconciliation} compact /></section>
    <div className="table-summary"><span><strong>Control reminder</strong> · Reconciliations should be reviewed by someone other than the preparer.</span><span>DDIN Finance · Internal</span></div>
  </>;
}

export function ReconciliationsView({ data, user, onOpenReconciliation, onNewImport, searchText = "" }: ReconciliationProps) {
  const [query, setQuery] = useState(searchText);
  const [status, setStatus] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [order, setOrder] = useState("period_desc");
  const effectiveQuery = searchText || query;
  const rows = useMemo(() => data.reconciliations.filter((recon) => {
    const text = `${recon.accountName} ${recon.institution} ${recon.preparerName} ${recon.periodStart} ${recon.periodEnd}`.toLowerCase();
    return (!effectiveQuery || text.includes(effectiveQuery.toLowerCase())) && (status === "all" || recon.status === status) && (accountId === "all" || recon.accountId === accountId);
  }).sort((a, b) => order === "period_asc" ? a.periodEnd.localeCompare(b.periodEnd) : order === "difference_desc" ? Math.abs(b.difference) - Math.abs(a.difference) : b.periodEnd.localeCompare(a.periodEnd)), [data.reconciliations, effectiveQuery, status, accountId, order]);
  return <>
    <Heading eyebrow="Close management" title="Reconciliations" description="Search and review statement periods across the DDIN finance team." actions={<button className="btn btn-primary" onClick={onNewImport}><Plus size={14} /> New reconciliation</button>} />
    <section className="card section-card">
      <SectionHeading title="Reconciliation history" description={`${rows.length} of ${data.reconciliations.length} periods`} action={<div className="filters"><label className="global-search" style={{ width: 185, height: 32 }}><Search size={13} /><input aria-label="Search reconciliation history" placeholder="Search history" value={searchText || query} onChange={(event) => setQuery(event.target.value)} /></label><select className="filter-select" aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(humanStatus).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select className="filter-select" aria-label="Filter by account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="all">All accounts</option>{data.accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}</select><select className="filter-select" aria-label="Sort history" value={order} onChange={(event) => setOrder(event.target.value)}><option value="period_desc">Newest period</option><option value="period_asc">Oldest period</option><option value="difference_desc">Largest variance</option></select></div>} />
      <SummaryTable rows={rows} onOpen={onOpenReconciliation} />
      <div className="pagination"><span>Showing {rows.length} reconciliation{rows.length === 1 ? "" : "s"}</span><span>Sorted by {order === "difference_desc" ? "variance" : "statement period"}</span></div>
    </section>
    <div className="table-summary"><span><strong>Current user:</strong> {user.name} · {roleLabel[user.role]}</span><span>Financial records are retained by period for audit review.</span></div>
  </>;
}

export function ImportsView({ data, user, onOpenReconciliation, onNewImport, databaseConfigured, onDownloadFile }: FileProps) {
  const files = [...data.sourceFiles].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const size = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return <>
    <Heading eyebrow="Source records" title="Statement imports" description="Original files, normalized transactions, and their reconciliation period." actions={<button className="btn btn-primary" onClick={onNewImport}><Plus size={14} /> Import statements</button>} />
    <div className="callout" style={{ marginBottom: 15 }}><ShieldCheck size={15} /><span>Original source files are stored in Neon and linked to their imported transactions. Each import records its checksum, row count, source side, and uploader.</span></div>
    <section className="card section-card"><SectionHeading title="Imported source files" description={`${files.length} retained file${files.length === 1 ? "" : "s"}`} action={<span className="source-pill">Access · {roleLabel[user.role]}</span>} />
      <div className="table-scroll"><table><thead><tr><th>File</th><th>Source side</th><th>Reconciliation</th><th>Transactions</th><th>Imported by</th><th>Import date</th><th>Size</th><th /></tr></thead><tbody>
        {files.map((file) => { const recon = data.reconciliations.find((item) => item.id === file.reconciliationId); const uploader = data.users.find((item) => item.id === file.uploadedBy); return <tr key={file.id}>
          <td><div className="primary-cell" style={{ display: "flex", alignItems: "center", gap: 7 }}><FileText size={13} color="#71809a" />{file.fileName}</div><div className="secondary-cell">SHA-256 · {file.sha256.slice(0, 16)}…</div></td>
          <td><span className={`source-pill ${file.source}`}>{file.source}</span>{!file.importComplete && <div className="secondary-cell" style={{ color: "#a16e2d" }}>Import incomplete</div>}</td>
          <td>{recon ? <button className="table-action" onClick={() => onOpenReconciliation(recon.id)}>{recon.accountName}<div className="secondary-cell">{monthLabel(recon.periodEnd)}</div></button> : "—"}</td>
          <td>{file.rowCount.toLocaleString()}</td><td>{uploader?.name ?? "—"}</td><td>{dateLabel(file.importedAt.slice(0, 10))}</td><td>{size(file.fileSize)}</td>
          <td>{databaseConfigured ? <button className="icon-button" title="Download original statement" onClick={() => onDownloadFile(file)}><ArrowDownToLine size={14} /></button> : <span className="muted" title="Demo metadata has no original file payload"><LockKeyhole size={13} /></span>}</td>
        </tr>; })}
        {!files.length && <tr><td colSpan={8}><div className="empty-state"><strong>No statements have been imported</strong>Start with a bank statement and ledger export for the same account and period.</div></td></tr>}
      </tbody></table></div>
      <div className="pagination"><span>Uploaded statement sources remain linked to their reconciliation.</span><span>Limit: 2.5 MB per source file</span></div>
    </section>
    <div className="table-summary"><span><strong>Formats:</strong> CSV, Excel, and selectable-text PDF.</span><span>Source documents are available only to signed-in DDIN users.</span></div>
  </>;
}

function candidateScore(target: StatementTransaction, candidate: StatementTransaction) {
  let score = 0;
  const reasons: string[] = [];
  if (Math.round(target.amount * 100) === Math.round(candidate.amount * 100)) { score += 55; reasons.push("Same amount"); }
  const dateDiff = Math.abs(Date.parse(`${target.date}T00:00:00Z`) - Date.parse(`${candidate.date}T00:00:00Z`)) / 86_400_000;
  if (dateDiff === 0) { score += 25; reasons.push("Same date"); } else if (dateDiff <= 3) { score += 12; reasons.push(`${dateDiff} day${dateDiff === 1 ? "" : "s"} apart`); }
  const refA = (target.reference ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const refB = (candidate.reference ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (refA && refA === refB) { score += 30; reasons.push("Reference matches"); }
  return { score: Math.min(score, 100), reasons };
}

function ReviewNoteDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal narrow" role="dialog" aria-modal="true" aria-labelledby="review-note-title">
    <div className="modal-head"><div><h2 id="review-note-title">Return for changes</h2><p>Leave a clear note for the preparer.</p></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
    <div className="modal-body"><div className="field"><label htmlFor="review-note">Review note</label><textarea id="review-note" autoFocus placeholder="Describe what should be corrected…" value={note} onChange={(event) => setNote(event.target.value)} /></div></div>
    <div className="modal-footer"><span className="muted" style={{ fontSize: 9 }}>The note is added to the audit record.</span><div className="modal-footer-right"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!note.trim()} onClick={() => onSubmit(note.trim())}>Return reconciliation</button></div></div>
  </section></div>;
}

export function ExceptionsView({ data, user, onOpenReconciliation, onNewImport, selectedReconciliationId, onAutoMatch, onManualMatch, onWorkflow }: ExceptionProps) {
  const reconciliation = data.reconciliations.find((item) => item.id === selectedReconciliationId) ?? [...data.reconciliations].sort((a, b) => Number(openCount(b) > 0) - Number(openCount(a) > 0))[0];
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [filterSource, setFilterSource] = useState("all");
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  if (!reconciliation) return <><Heading eyebrow="Review workbench" title="Exceptions" description="Inspect unmatched bank and ledger entries." /><section className="card empty-big"><div className="empty-big-icon"><FileSearch size={20} /></div><h3>No reconciliation has been started</h3><p>Create a reconciliation and import a bank statement with its corresponding ledger export to begin matching.</p><button className="btn btn-primary" onClick={onNewImport}><Plus size={13} /> New reconciliation</button></section></>;
  const transactions = data.transactions.filter((item) => item.reconciliationId === reconciliation.id);
  const unmatched = transactions.filter((item) => !item.matchId && (filterSource === "all" || item.source === filterSource));
  const selected = unmatched.find((item) => item.id === selectedTransactionId) ?? unmatched[0];
  const candidates = selected ? transactions.filter((item) => !item.matchId && item.source !== selected.source).map((item) => ({ item, ...candidateScore(selected, item) })).sort((a, b) => b.score - a.score).slice(0, 4) : [];
  const canPrepare = ["admin", "preparer"].includes(user.role) && !["approved", "in_review"].includes(reconciliation.status);
  const canReview = ["admin", "reviewer"].includes(user.role) && user.id !== reconciliation.preparerId && reconciliation.status === "in_review";
  const allRows = data.transactions.filter((item) => item.reconciliationId === reconciliation.id);
  const matchedPairs = new Set(allRows.filter((item) => item.matchId).map((item) => item.matchId)).size;
  const computedDiff = Math.round(reconciliation.difference * 100) / 100;
  const cleanToApprove = !transactions.some((item) => !item.matchId) && computedDiff === 0;

  async function run(action: () => Promise<void>) {
    setBusy(true); setActionError("");
    try { await action(); } catch (error) { setActionError(error instanceof Error ? error.message : "Action could not be completed."); }
    finally { setBusy(false); }
  }

  return <>
    <Heading eyebrow="Review workbench" title="Exceptions & matching" description="Resolve unmatched entries, then send a balanced period for independent review." actions={<>
      <select className="filter-select" aria-label="Select reconciliation" value={reconciliation.id} onChange={(event) => onOpenReconciliation(event.target.value)}>{data.reconciliations.map((item) => <option key={item.id} value={item.id}>{item.accountName} · {monthLabel(item.periodEnd)}</option>)}</select>
      <button className="btn" onClick={() => void run(() => onAutoMatch(reconciliation.id))} disabled={!canPrepare || busy}><Sparkles size={13} /> Auto-match</button>
    </>} />
    <div className="metric-strip">
      <div className="metric-box"><div className="metric-label">Paired transactions</div><div className="metric-value">{matchedPairs}</div></div>
      <div className="metric-box"><div className="metric-label">Unmatched bank</div><div className="metric-value" style={{ color: reconciliation.unmatchedBankCount ? "#a16e2d" : "#39775e" }}>{reconciliation.unmatchedBankCount}</div></div>
      <div className="metric-box"><div className="metric-label">Unmatched ledger</div><div className="metric-value" style={{ color: reconciliation.unmatchedLedgerCount ? "#a16e2d" : "#39775e" }}>{reconciliation.unmatchedLedgerCount}</div></div>
    </div>
    <div className="exception-layout">
      <section className="card section-card"><SectionHeading title={reconciliation.accountName} description={`${reconciliation.institution} · ${rangeLabel(reconciliation)}`} action={<StatusBadge status={reconciliation.status} />} />
        <div className="section-head" style={{ borderBottom: "0", paddingTop: 12, paddingBottom: 11 }}><div className="filters"><button className={`btn btn-small ${filterSource === "all" ? "btn-primary" : ""}`} onClick={() => setFilterSource("all")}>All unmatched</button><button className={`btn btn-small ${filterSource === "bank" ? "btn-primary" : ""}`} onClick={() => setFilterSource("bank")}>Bank side</button><button className={`btn btn-small ${filterSource === "ledger" ? "btn-primary" : ""}`} onClick={() => setFilterSource("ledger")}>Ledger side</button></div><span className="muted" style={{ fontSize: 9 }}>{unmatched.length} row{unmatched.length === 1 ? "" : "s"}</span></div>
        <div>{unmatched.map((item) => <div className={`exception-row ${selected?.id === item.id ? "selected" : ""}`} key={item.id} role="button" tabIndex={0} onClick={() => setSelectedTransactionId(item.id)} onKeyDown={(event) => event.key === "Enter" && setSelectedTransactionId(item.id)}>
          <div className="exception-main"><div><div className="exception-title">{item.description}</div><div className="exception-description">{dateLabel(item.date)}{item.reference ? ` · Ref ${item.reference}` : " · No reference"}</div><div className="exception-badges"><span className={`source-pill ${item.source}`}>{item.source}</span><span className="mini-badge">Unmatched</span></div></div><div className="amount-cell">{currency(item.amount, item.currency)}</div></div>
        </div>)}
          {!unmatched.length && <div className="empty-state"><strong>All imported entries are matched</strong>{transactions.length ? "Check the statement and ledger balances, then submit the period for review." : "Import source files for this period to see transaction rows."}</div>}
        </div>
        <div className="table-summary"><span><strong>Statement balance:</strong> {currency(reconciliation.statementBalance, reconciliation.currency)}</span><span><strong>Ledger balance:</strong> {currency(reconciliation.bookBalance, reconciliation.currency)}</span><span><strong>Difference:</strong> {currency(reconciliation.difference, reconciliation.currency)}</span></div>
      </section>
      <section className="card exception-detail">
        <div className="card-heading"><div><div className="card-title">{selected ? "Suggested counterpart" : "Review action"}</div><div className="card-subtitle">{selected ? `Candidate rows from the ${selected.source === "bank" ? "ledger" : "bank"} statement` : "Current period control"}</div></div><span className="detail-icon"><Filter size={14} /></span></div>
        {selected ? <>
          <div className="candidate-card" style={{ marginTop: 14, background: "#fafbfd" }}><div className="mini-badge" style={{ display: "inline-block" }}>Selected · {selected.source}</div><h3 style={{ marginTop: 8 }}>{selected.description}</h3><p>{dateLabel(selected.date)}{selected.reference ? ` · ${selected.reference}` : ""}</p><div className="candidate-match"><span>Amount</span><strong>{currency(selected.amount, selected.currency)}</strong></div></div>
          <div className="subsection-title"><span>Possible matches</span><span>{candidates.length}</span></div>
          {candidates.map(({ item, score, reasons }) => <div className="candidate-card" key={item.id}><div className="candidate-match"><h3>{item.description}</h3><span className="candidate-score">{score}%</span></div><p>{dateLabel(item.date)}{item.reference ? ` · ${item.reference}` : ""}</p><div className="candidate-match"><span>{reasons.length ? reasons.join(" · ") : "Review details"}</span><strong>{currency(item.amount, item.currency)}</strong></div><button className="btn btn-small btn-primary" disabled={!canPrepare || busy} onClick={() => void run(() => onManualMatch(reconciliation.id, selected.source === "bank" ? selected : item, selected.source === "ledger" ? selected : item))}><Check size={12} /> Match pair</button></div>)}
          {!candidates.length && <div className="empty-state" style={{ padding: "20px 4px" }}>No unmatched counterpart is available on the other side. Add the missing statement or leave this as an explained open item.</div>}
        </> : <div className="empty-state" style={{ padding: "28px 8px" }}><strong>Nothing selected</strong>Select an unmatched row to review candidate entries.</div>}
        {actionError && <div className="callout warning" style={{ marginTop: 12 }}><AlertCircle size={14} /><span>{actionError}</span></div>}
        <hr className="divider" />
        <div className="card-heading"><div><div className="card-title">Period approval</div><div className="card-subtitle">Preparer {reconciliation.preparerName}{reconciliation.reviewerName ? ` · Reviewer ${reconciliation.reviewerName}` : ""}</div></div><ShieldCheck size={16} color="#7584a0" /></div>
        {reconciliation.reviewerId && reconciliation.status === "needs_attention" && <div className="callout warning" style={{ marginTop: 12 }}><AlertCircle size={14} /><span>Reviewer note · {reconciliation.reviewerName ?? "Reviewer"}: {reconciliation.reviewerNote || "Returned this period for correction."}</span></div>}
        <div className="action-stack" style={{ marginTop: 13 }}>
          {canPrepare && reconciliation.status !== "in_review" && <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => onWorkflow(reconciliation.id, "submit"))}><ClipboardCheck size={13} /> Submit for review</button>}
          {canReview && <>
            <button className="btn btn-primary" disabled={busy || !cleanToApprove} title={!cleanToApprove ? "Match every transaction and resolve the balance difference first." : undefined} onClick={() => void run(() => onWorkflow(reconciliation.id, "approve"))}><CheckCircle2 size={13} /> Approve period</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => setNoteOpen(true)}><ArrowUpRight size={13} /> Return for changes</button>
          </>}
          {reconciliation.status === "in_review" && user.id === reconciliation.preparerId && <span className="callout" style={{ width: "100%" }}><LockKeyhole size={14} /> The preparer cannot approve their own reconciliation.</span>}
          {reconciliation.status === "in_review" && !canReview && user.id !== reconciliation.preparerId && <span className="callout" style={{ width: "100%" }}><LockKeyhole size={14} /> Waiting for a reviewer or administrator.</span>}
          {reconciliation.status === "approved" && <span className="callout" style={{ width: "100%" }}><CheckCircle2 size={14} /> Approved by {reconciliation.reviewerName ?? "reviewer"}. This period is locked.</span>}
          {reconciliation.status === "draft" && !canPrepare && <span className="callout" style={{ width: "100%" }}><LockKeyhole size={14} /> This role can review records but cannot change a reconciliation.</span>}
        </div>
      </section>
    </div>
    {noteOpen && <ReviewNoteDialog onClose={() => setNoteOpen(false)} onSubmit={(note) => { setNoteOpen(false); void run(() => onWorkflow(reconciliation.id, "return", note)); }} />}
  </>;
}

export function ReportsView({ data, user, onOpenReconciliation, onNewImport, onExport }: ReportProps) {
  const today = new Date();
  const [start, setStart] = useState(`${today.getFullYear()}-01-01`);
  const [end, setEnd] = useState(`${today.getFullYear()}-12-31`);
  const rows = data.reconciliations.filter((item) => item.periodEnd >= start && item.periodStart <= end).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const open = rows.reduce((sum, item) => sum + openCount(item), 0);
  const balanceDifference = rows.reduce((sum, item) => sum + item.difference, 0);
  const matchedCount = rows.reduce((sum, item) => sum + item.matchedCount, 0);
  const byAccount = data.accounts.map((account) => {
    const accountRows = rows.filter((item) => item.accountId === account.id);
    const latest = [...accountRows].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
    return { account, latest, rows: accountRows.length, open: accountRows.reduce((sum, item) => sum + openCount(item), 0), difference: accountRows.reduce((sum, item) => sum + item.difference, 0) };
  }).filter((item) => item.rows);
  return <>
    <Heading eyebrow="Period reporting" title="Reports" description="Review closing balances, variances, match activity, and unresolved items." actions={<><button className="btn" onClick={() => window.print()}><Printer size={13} /> Print report</button><button className="btn" onClick={onNewImport}><Plus size={13} /> New reconciliation</button><button className="btn btn-primary" onClick={() => onExport(rows)}><FileDown size={13} /> Export CSV</button></>} />
    <section className="card card-pad" style={{ marginBottom: 14 }}><div className="card-heading"><div><div className="card-title">Reporting period</div><div className="card-subtitle">Include reconciliations whose statement periods overlap these dates.</div></div><span className="source-pill">Prepared by {user.name}</span></div><div className="filters" style={{ marginTop: 13 }}><label className="field" style={{ width: 155 }}><span className="field-help">From</span><input className="filter-input" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="field" style={{ width: 155 }}><span className="field-help">Through</span><input className="filter-input" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label><button className="btn btn-small" style={{ marginTop: 14 }} onClick={() => { setStart(`${today.getFullYear()}-01-01`); setEnd(`${today.getFullYear()}-12-31`); }}><RefreshCw size={12} /> This year</button></div></section>
    <div className="report-kpis">
      <div className="card report-kpi"><span>Reconciliations in period</span><strong>{rows.length}</strong><span>Across {byAccount.length} active account{byAccount.length === 1 ? "" : "s"}</span></div>
      <div className="card report-kpi"><span>Matched transaction pairs</span><strong>{matchedCount.toLocaleString()}</strong><span>Exact and reviewed matches</span></div>
      <div className="card report-kpi"><span>Open items · net difference</span><strong style={{ color: open ? "#a06d2c" : "#39785f" }}>{open} · {currency(balanceDifference)}</strong><span>Open items need follow-up before approval</span></div>
    </div>
    <section className="card section-card"><SectionHeading title="Account close summary" description="Latest closing balance in each account within the selected dates" action={<span className="source-pill">{rows.length} periods</span>} />
      <div className="table-scroll"><table><thead><tr><th>Account</th><th>Latest period</th><th>Close status</th><th className="amount-cell">Statement close</th><th>Periods</th><th>Open items</th><th className="amount-cell">Net difference</th><th /></tr></thead><tbody>
        {byAccount.map(({ account, latest, rows: periodCount, open: accountOpen, difference }) => latest && <tr key={account.id}><td><div className="primary-cell">{account.name}</div><div className="secondary-cell">{account.institution}</div></td><td>{monthLabel(latest.periodEnd)}</td><td><StatusBadge status={latest.status} /></td><td className="amount-cell">{currency(latest.statementBalance, account.currency)}</td><td>{periodCount}</td><td>{accountOpen}</td><td className="amount-cell">{currency(difference, account.currency)}</td><td><button className="table-action" onClick={() => onOpenReconciliation(latest.id)}>Open period</button></td></tr>)}
        {!byAccount.length && <tr><td colSpan={8}><div className="empty-state"><strong>No period data in this range</strong>Change the report dates or create a new reconciliation.</div></td></tr>}
      </tbody></table></div>
      <div className="pagination"><span>Report prepared {new Date().toLocaleDateString("en-GB", { dateStyle: "medium" })}</span><span>Confidential · DDIN Finance</span></div>
    </section>
    <div className="table-summary"><span><strong>Approval control:</strong> a reviewer cannot approve their own preparation.</span><span>Source: retained DDIN reconciliation records.</span></div>
  </>;
}

export function AuditView({ data, user, onOpenReconciliation }: AuditProps) {
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const actions = [...new Set(data.auditLog.map((entry) => entry.action))].sort();
  const rows = data.auditLog.filter((entry) => {
    const details = JSON.stringify(entry.details).toLowerCase();
    const text = `${entry.actorName} ${entry.action} ${entry.entityType} ${entry.entityId} ${details}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (actionFilter === "all" || entry.action === actionFilter);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <>
    <Heading eyebrow="Control evidence" title="Audit trail" description="Chronological record of imports, matching, approvals, and access changes." actions={<span className="mode-chip"><ShieldCheck size={11} /> Append-only</span>} />
    <div className="callout" style={{ marginBottom: 15 }}><LockKeyhole size={15} /><span>Audit entries are retained in the database and protected from update or deletion by a database trigger. Search by person, action, account, file, or reconciliation ID.</span></div>
    <section className="card section-card"><SectionHeading title="Activity log" description={`${rows.length} event${rows.length === 1 ? "" : "s"}`} action={<div className="filters"><label className="global-search" style={{ width: 190, height: 32 }}><Search size={13} /><input aria-label="Search audit trail" placeholder="Search audit trail" value={query} onChange={(event) => setQuery(event.target.value)} /></label><select className="filter-select" aria-label="Filter audit action" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">All actions</option>{actions.map((action) => <option key={action}>{action}</option>)}</select></div>} />
      <div className="table-scroll"><table><thead><tr><th>Event</th><th>Person</th><th>Record</th><th>Details</th><th>Date and time</th></tr></thead><tbody>
        {rows.map((entry) => <tr key={entry.id}><td><span className="audit-action"><span className="audit-icon"><Activity size={11} /></span>{entry.action}</span></td><td><div className="primary-cell">{entry.actorName}</div><div className="secondary-cell">{data.users.find((item) => item.id === entry.actorId)?.role ?? "former user"}</div></td><td>{entry.entityType === "reconciliation" ? <button className="table-action" onClick={() => onOpenReconciliation(entry.entityId)}>{entry.entityId.slice(0, 10)}…</button> : <span className="muted">{entry.entityType} · {entry.entityId.slice(0, 12)}</span>}</td><td><span className="muted">{Object.entries(entry.details).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "—"}</span></td><td><div className="primary-cell">{new Date(entry.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</div><div className="secondary-cell">{new Date(entry.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div></td></tr>)}
        {!rows.length && <tr><td colSpan={5}><div className="empty-state"><strong>No audit events found</strong>Try a broader search.</div></td></tr>}
      </tbody></table></div><div className="pagination"><span>Newest events appear first.</span><span>Viewing as {roleLabel[user.role]}</span></div>
    </section>
  </>;
}

export function TeamView({ data, user, onCreateUser, onCreateAccount, onUpdateUser }: TeamProps) {
  const isAdmin = user.role === "admin";
  const [userForm, setUserForm] = useState(false);
  const [accountForm, setAccountForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("preparer");
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [institution, setInstitution] = useState("");
  const [accountCurrency, setAccountCurrency] = useState("RWF");
  const [accountDigits, setAccountDigits] = useState("");

  async function submitUser(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { await onCreateUser({ name, email, role, password }); setUserForm(false); setName(""); setEmail(""); setPassword(""); setMessage("User added. Share the temporary password with them privately."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The user could not be added."); }
    finally { setSaving(false); }
  }
  async function submitAccount(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { await onCreateAccount({ name: accountName, institution, currency: accountCurrency, accountNumber: accountDigits }); setAccountForm(false); setAccountName(""); setInstitution(""); setAccountDigits(""); setMessage("Bank account added."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The account could not be added."); }
    finally { setSaving(false); }
  }

  return <>
    <Heading eyebrow="Access and accounts" title="Team & settings" description="Manage DDIN users, assigned roles, and bank account records." actions={isAdmin ? <><button className="btn" onClick={() => setAccountForm(true)}><Plus size={13} /> Add account</button><button className="btn btn-primary" onClick={() => setUserForm(true)}><Users size={13} /> Add user</button></> : <span className="mode-chip"><LockKeyhole size={11} /> View only</span>} />
    {message && <div className="callout" style={{ marginBottom: 13 }}><CheckCircle2 size={15} />{message}</div>}{error && <div className="callout warning" style={{ marginBottom: 13 }}><AlertCircle size={15} />{error}</div>}
    <div className="team-grid">
      <section className="card section-card"><SectionHeading title="Finance team" description={`${data.users.filter((item) => item.active).length} active user accounts`} action={<span className="source-pill">Role-based access</span>} />
        <div className="table-scroll"><table style={{ minWidth: 650 }}><thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Access</th></tr></thead><tbody>{data.users.map((member) => <tr key={member.id}>
          <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="avatar" style={{ width: 27, height: 27 }}>{initials(member.name)}</span><span className="primary-cell">{member.name}{member.id === user.id ? " · You" : ""}</span></div></td><td>{member.email}</td>
          <td>{isAdmin && member.id !== user.id ? <select className="filter-select" value={member.role} onChange={(event) => void onUpdateUser({ ...member, role: event.target.value as UserRole }).catch((cause) => setError(cause instanceof Error ? cause.message : "The role could not be updated."))}>{Object.entries(roleLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : roleLabel[member.role]}</td>
          <td>{member.active ? <span style={{ color: "#39775e" }}>Active</span> : <span style={{ color: "#a35a58" }}>Disabled</span>}</td><td>{isAdmin && member.id !== user.id ? <button className={`btn btn-small ${member.active ? "btn-danger" : ""}`} onClick={() => void onUpdateUser({ ...member, active: !member.active }).catch((cause) => setError(cause instanceof Error ? cause.message : "User access could not be changed."))}>{member.active ? "Disable" : "Enable"}</button> : <span className="muted">—</span>}</td>
        </tr>)}</tbody></table></div>
        <div className="table-summary"><span><strong>Preparer:</strong> creates imports and matches entries.</span><span><strong>Reviewer:</strong> independently returns or approves.</span><span><strong>Auditor:</strong> read-only history and source access.</span></div>
      </section>
      <section className="card section-card"><SectionHeading title="Bank accounts" description={`${data.accounts.length} configured accounts`} action={isAdmin && <button className="link-button" onClick={() => setAccountForm(true)}>Add account <Plus size={11} /></button>} />
        <div className="account-list">{data.accounts.map((account) => <div className="account-item" key={account.id}><div className="account-labels"><span className="account-icon"><Banknote size={15} /></span><div style={{ minWidth: 0 }}><div className="account-name">{account.name}</div><div className="account-sub">{account.institution} · {account.accountNumber}</div></div></div><span className="source-pill">{account.currency}</span></div>)}
          {!data.accounts.length && <div className="empty-state">No accounts have been configured.</div>}
        </div><div className="table-summary"><span>Account identifiers are masked in the workspace.</span><span>Keep bank account access limited to finance staff.</span></div>
      </section>
    </div>
    {userForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && setUserForm(false)}><section className="modal narrow" role="dialog" aria-modal="true" aria-labelledby="add-user-heading"><div className="modal-head"><div><h2 id="add-user-heading">Add a finance user</h2><p>Create a named account with a single role.</p></div><button className="icon-button" aria-label="Close" onClick={() => setUserForm(false)}><X size={16} /></button></div><form onSubmit={submitUser}><div className="modal-body"><div className="field-grid"><div className="field full"><label htmlFor="user-name">Full name</label><input id="user-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="field full"><label htmlFor="user-email">DDIN email</label><input id="user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="field full"><label htmlFor="user-role">Role</label><select id="user-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>{Object.entries(roleLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="field full"><label htmlFor="user-password">Temporary password</label><input id="user-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} maxLength={128} required /><span className="field-help">At least 12 characters. Deliver it privately; users will need to change it themselves.</span></div></div></div><div className="modal-footer"><span className="muted" style={{ fontSize: 9 }}>Password is stored as a one-way hash.</span><div className="modal-footer-right"><button type="button" className="btn" onClick={() => setUserForm(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Adding…" : "Add user"}</button></div></div></form></section></div>}
    {accountForm && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && setAccountForm(false)}><section className="modal narrow" role="dialog" aria-modal="true" aria-labelledby="add-account-heading"><div className="modal-head"><div><h2 id="add-account-heading">Add a bank account</h2><p>Only a masked account identifier is saved.</p></div><button className="icon-button" aria-label="Close" onClick={() => setAccountForm(false)}><X size={16} /></button></div><form onSubmit={submitAccount}><div className="modal-body"><div className="field-grid"><div className="field full"><label htmlFor="account-name">Account name</label><input id="account-name" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Operating account" required /></div><div className="field full"><label htmlFor="institution">Financial institution</label><input id="institution" value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Bank of Kigali" required /></div><div className="field"><label htmlFor="account-currency">Currency</label><input id="account-currency" value={accountCurrency} onChange={(event) => setAccountCurrency(event.target.value.toUpperCase().slice(0, 3))} maxLength={3} required /></div><div className="field"><label htmlFor="account-number">Last 4 digits only</label><input id="account-number" inputMode="numeric" value={accountDigits} onChange={(event) => setAccountDigits(event.target.value.replace(/\D/g, "").slice(-4))} minLength={4} maxLength={4} required /></div></div></div><div className="modal-footer"><span className="muted" style={{ fontSize: 9 }}>Full account numbers are never stored.</span><div className="modal-footer-right"><button type="button" className="btn" onClick={() => setAccountForm(false)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Adding…" : "Add account"}</button></div></div></form></section></div>}
  </>;
}

export function ReportsExportButton({ onClick }: { onClick: () => void }) { return <button className="btn btn-primary" onClick={onClick}><ArrowDownToLine size={13} /> Export</button>; }
