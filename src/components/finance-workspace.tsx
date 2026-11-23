"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { Activity, AlertCircle, ChevronRight, ClipboardCheck, FileClock, FileSpreadsheet, FileText, LayoutDashboard, ListChecks, LogOut, Menu, Search, Settings2, ShieldCheck } from "lucide-react";
import ImportDialog, { type ImportSubmission } from "@/components/import-dialog";
import PortalChooser from "@/components/portal-chooser";
import {
  AuditView, ExceptionsView, ImportsView, OverviewView, ReconciliationsView, ReportsView, TeamView,
  type CreateAccountPayload, type CreateUserPayload, type OrganizationProfilePayload, type ViewKey, type WorkflowAction,
} from "@/components/workspace-views";
import { demoWorkspace } from "@/lib/demo-data";
import { matchTransactions } from "@/lib/reconciliation";
import type { Account, AppUser, AuditEntry, OrganizationSummary, Reconciliation, SourceFile, StatementTransaction, WorkspaceData } from "@/lib/types";

type Props = { databaseConfigured: boolean };
type Notice = { message: string; error?: boolean };
const labels: Record<ViewKey, string> = { overview: "Overview", reconciliations: "Reconciliations", imports: "Statement imports", exceptions: "Exceptions & matching", reports: "Reports", audit: "Audit trail", team: "Team & settings" };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

async function apiRequest<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The request could not be completed.");
  return body as T;
}

function addAudit(workspace: WorkspaceData, actor: AppUser, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}): AuditEntry[] {
  return [{ id: crypto.randomUUID(), actorId: actor.id, actorName: actor.name, action, entityType, entityId, details, createdAt: new Date().toISOString() }, ...workspace.auditLog];
}

function transactionCounts(transactions: StatementTransaction[], reconciliationId: string) {
  const rows = transactions.filter((item) => item.reconciliationId === reconciliationId);
  const matched = new Set(rows.filter((item) => item.matchId).map((item) => item.matchId)).size;
  return { matchedCount: matched, unmatchedBankCount: rows.filter((item) => item.source === "bank" && !item.matchId).length, unmatchedLedgerCount: rows.filter((item) => item.source === "ledger" && !item.matchId).length };
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await onLogin(username, password); } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign-in could not be completed."); }
    finally { setBusy(false); }
  }
  return <div className="login-screen">
    <aside className="login-aside"><div className="login-brand"><span className="login-brand-mark"><Image src="/ddin-logo.png" width={160} height={160} alt="DDIN" /></span><div><strong>FINANCE PORTALS</strong><small>Reconciliation workspace</small></div></div><div className="login-copy"><div className="eyebrow">Finance operations</div><h1>Clear records.<br />Confident close.</h1><p>A controlled workspace for statement imports, transaction review, independent approvals, and period reporting.</p></div><div className="login-foot">Access is managed by your organization administrator.</div></aside>
    <div className="login-form-side"><form className="login-form" onSubmit={submit}><h2>Sign in to Finance</h2><p>Use your assigned finance account to continue.</p>
      <div className="field"><label htmlFor="login-username">Username or email</label><input id="login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your assigned username" required /></div>
      <div className="field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      {error && <div className="callout warning" style={{ marginTop: 12 }}><AlertCircle size={14} />{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ChevronRight size={14} /></button>
      <div className="demo-banner">Sign-in is enabled after the Neon database and first administrator are configured.</div>
    </form></div>
  </div>;
}

function Sidebar({ view, onNavigate, data, open, onClose, currentUser }: { view: ViewKey; onNavigate: (view: ViewKey) => void; data: WorkspaceData; open: boolean; onClose: () => void; currentUser: AppUser }) {
  const openRecs = data.reconciliations.filter((item) => item.status !== "approved").length;
  const openItems = data.reconciliations.reduce((sum, item) => sum + item.unmatchedBankCount + item.unmatchedLedgerCount, 0);
  const groups: Array<{ label: string; items: Array<{ id: ViewKey; icon: typeof LayoutDashboard; count?: number }> }> = [
    { label: "Workspace", items: [{ id: "overview", icon: LayoutDashboard }, { id: "reconciliations", icon: FileSpreadsheet, count: openRecs }, { id: "imports", icon: FileText }, { id: "exceptions", icon: ListChecks, count: openItems || undefined }] },
    { label: "Insights", items: [{ id: "reports", icon: Activity }, { id: "audit", icon: FileClock }] },
    { label: "Administration", items: [{ id: "team", icon: Settings2 }] },
  ];
  return <>
    <div className={`mobile-backdrop ${open ? "show" : ""}`} onClick={onClose} />
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark">{data.organization.logoUrl ? <Image src={data.organization.logoUrl} alt="" width={160} height={160} unoptimized /> : <span className="brand-monogram">{data.organization.name.slice(0, 4).toUpperCase()}</span>}</div><div><div className="brand-name">{data.organization.name.toUpperCase()} FINANCE</div><div className="brand-caption">Reconciliation office</div></div></div>
      <nav className="nav-wrap">{groups.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map((item) => <button key={item.id} className={`nav-link ${view === item.id ? "active" : ""}`} onClick={() => { onNavigate(item.id); onClose(); }}><item.icon size={15} strokeWidth={1.8} /><span>{labels[item.id]}</span>{item.count ? <span className="nav-count">{item.count > 99 ? "99+" : item.count}</span> : null}</button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="close-progress"><div className="close-progress-head"><span>November close</span><span>{openItems ? `${Math.max(0, Math.round(100 - openItems * 12))}%` : "100%"}</span></div><div className="close-progress-sub">{openItems ? `${openItems} transactions need attention` : "All current periods are clear"}</div><div className="progress-track"><div className="progress-fill" style={{ width: `${openItems ? Math.max(12, 100 - openItems * 12) : 100}%` }} /></div></div><div className="user-card"><span className="avatar">{initials(currentUser.name)}</span><div className="user-card-copy"><div className="user-card-name">{currentUser.name}</div><div className="user-card-role">{currentUser.role}</div></div><ShieldCheck size={14} color="#8591a6" /></div></div>
    </aside>
  </>;
}

export default function FinanceWorkspace({ databaseConfigured }: Props) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(demoWorkspace);
  const [user, setUser] = useState<AppUser | null>(databaseConfigured ? null : demoWorkspace.users[0]);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [view, setView] = useState<ViewKey>("overview");
  const [selectedReconciliationId, setSelectedReconciliationId] = useState("");
  const [searchText, setSearchText] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [authReady, setAuthReady] = useState(!databaseConfigured);
  const isDemo = !databaseConfigured;

  const refreshWorkspace = useCallback(async () => {
    const result = await apiRequest<{ data: WorkspaceData }>("/api/workspace");
    setWorkspace(result.data);
    return result.data;
  }, []);

  useEffect(() => {
    let alive = true;
    if (!databaseConfigured) {
      try {
        const stored = localStorage.getItem("ddin-finance-demo-v1");
        if (stored) {
          const snapshot = JSON.parse(stored) as { workspace?: WorkspaceData; userId?: string };
          window.requestAnimationFrame(() => {
            if (!alive) return;
            if (snapshot.workspace?.accounts) setWorkspace(snapshot.workspace);
            if (snapshot.userId) setUser(snapshot.workspace?.users.find((candidate) => candidate.id === snapshot.userId) ?? demoWorkspace.users[0]);
          });
        }
      } catch { localStorage.removeItem("ddin-finance-demo-v1"); }
      return () => { alive = false; };
    }
    (async () => {
      try {
        const session = await apiRequest<{ user: AppUser | null; organizations: OrganizationSummary[] }>("/api/auth/me");
        if (session.user) {
          if (alive) setUser(session.user);
          if (alive) setOrganizations(session.organizations ?? []);
          if (session.user.organizationId) {
            const data = await apiRequest<{ data: WorkspaceData }>("/api/workspace");
            if (alive) setWorkspace(data.data);
          }
        }
      } catch (error) {
        if (alive) setNotice({ message: error instanceof Error ? error.message : "The workspace could not be loaded.", error: true });
      } finally { if (alive) setAuthReady(true); }
    })();
    return () => { alive = false; };
  }, [databaseConfigured]);

  useEffect(() => {
    if (isDemo && authReady && user) localStorage.setItem("ddin-finance-demo-v1", JSON.stringify({ workspace, userId: user.id }));
  }, [workspace, user, isDemo, authReady]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function login(username: string, password: string) {
    const result = await apiRequest<{ user: AppUser }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    setUser(result.user);
    if (result.user.platformAdmin && !result.user.organizationId) {
      const directory = await apiRequest<{ organizations: OrganizationSummary[] }>("/api/auth/me");
      setOrganizations(directory.organizations ?? []);
      setNotice({ message: `Welcome back, ${result.user.name}.` });
      return;
    }
    const data = await refreshWorkspace();
    const current = data.users.find((item) => item.id === result.user.id) ?? result.user;
    setUser(current);
    setNotice({ message: `Welcome back, ${current.name}.` });
  }

  async function selectOrganization(organizationId: string) {
    const result = await apiRequest<{ user: AppUser }>("/api/auth/select-organization", { method: "POST", body: JSON.stringify({ organizationId }) });
    setUser(result.user);
    await refreshWorkspace();
    const organization = organizations.find((item) => item.id === organizationId);
    setNotice({ message: `${organization?.name ?? "Organization"} portal opened.` });
  }

  async function createOrganization(profile: OrganizationProfilePayload) {
    const result = await apiRequest<{ organization: OrganizationSummary }>("/api/organizations", { method: "POST", body: JSON.stringify(profile) });
    setOrganizations((current) => [...current, result.organization].sort((a, b) => a.name.localeCompare(b.name)));
    await selectOrganization(result.organization.id);
  }

  async function switchToPortalDirectory() {
    const result = await apiRequest<{ user: AppUser }>("/api/auth/select-organization", { method: "POST", body: JSON.stringify({ organizationId: null }) });
    setUser(result.user);
    setWorkspace(demoWorkspace);
  }

  async function logout() {
    if (databaseConfigured) await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(isDemo ? demoWorkspace.users[0] : null);
    setWorkspace(demoWorkspace);
    setView("overview");
    setNotice({ message: isDemo ? "Demo changes cleared for this session." : "You have signed out." });
  }

  function openReconciliation(id: string) {
    if (id) setSelectedReconciliationId(id);
    setView("exceptions");
  }
  function changeView(next: ViewKey) {
    setView(next);
    if (next === "exceptions" && !selectedReconciliationId) {
      const nextId = workspace.reconciliations.find((item) => item.unmatchedBankCount + item.unmatchedLedgerCount > 0)?.id ?? workspace.reconciliations[0]?.id ?? "";
      setSelectedReconciliationId(nextId);
    }
  }

  async function saveImport(submission: ImportSubmission) {
    if (!user) throw new Error("Sign in to continue.");
    const account = workspace.accounts.find((item) => item.id === submission.accountId);
    if (!account) throw new Error("Choose an active bank account.");
    const timestamp = new Date().toISOString();
    if (databaseConfigured) {
      const created = await apiRequest<{ id: string }>("/api/reconciliations", { method: "POST", body: JSON.stringify({ accountId: submission.accountId, periodStart: submission.periodStart, periodEnd: submission.periodEnd, statementBalance: submission.statementBalance, bookBalance: submission.bookBalance }) });
      for (const item of submission.files) {
        const sourceFile = await apiRequest<{ sourceFileId: string }>(`/api/reconciliations/${created.id}/import`, { method: "POST", body: JSON.stringify({
          fileName: item.file.name, contentType: item.file.type || "application/octet-stream", contentBase64: item.contentBase64, sha256: item.sha256,
          source: item.source, currency: account.currency, rowCount: item.parsed.rows.length,
        }) });
        for (let startRow = 0; startRow < item.parsed.rows.length; startRow += 500) {
          await apiRequest(`/api/source-files/${sourceFile.sourceFileId}/transactions`, { method: "POST", body: JSON.stringify({
            startRow, totalRows: item.parsed.rows.length, rows: item.parsed.rows.slice(startRow, startRow + 500),
          }) });
        }
      }
      await apiRequest(`/api/reconciliations/${created.id}/auto-match`, { method: "POST" });
      await refreshWorkspace();
      setSelectedReconciliationId(created.id);
      setView("exceptions");
      setNotice({ message: `${submission.files.length} source file${submission.files.length === 1 ? "" : "s"} imported. Review unmatched entries before submission.` });
      return;
    }

    const reconId = crypto.randomUUID();
    const newRecon: Reconciliation = { id: reconId, accountId: account.id, accountName: account.name, institution: account.institution, currency: account.currency, periodStart: submission.periodStart, periodEnd: submission.periodEnd, statementBalance: submission.statementBalance, bookBalance: submission.bookBalance, difference: Math.round((submission.statementBalance - submission.bookBalance) * 100) / 100, status: "draft", preparerId: user.id, preparerName: user.name, createdAt: timestamp, updatedAt: timestamp, matchedCount: 0, unmatchedBankCount: 0, unmatchedLedgerCount: 0 };
    const newFiles: SourceFile[] = [];
    let newTransactions: StatementTransaction[] = [];
    for (const item of submission.files) {
      const fileId = crypto.randomUUID();
      newFiles.push({ id: fileId, reconciliationId: reconId, fileName: item.file.name, source: item.source, rowCount: item.parsed.rows.length, fileSize: item.file.size, sha256: item.sha256, importedAt: timestamp, uploadedBy: user.id, importComplete: true });
      newTransactions.push(...item.parsed.rows.map((row, rowIndex) => ({ id: `${fileId}-${rowIndex}`, reconciliationId: reconId, sourceFileId: fileId, source: item.source, date: row.date, description: row.description, reference: row.reference, amount: row.amount, currency: account.currency })));
    }
    const matched = matchTransactions(newTransactions);
    for (const pair of matched.matches) {
      const matchId = crypto.randomUUID();
      newTransactions = newTransactions.map((item) => item.id === pair.bank.id || item.id === pair.ledger.id ? { ...item, matchId } : item);
    }
    const counts = transactionCounts(newTransactions, reconId);
    const auditRows = [{ actor: user, action: "Created reconciliation", type: "reconciliation", id: reconId, details: { account: account.name, period: `${submission.periodStart} to ${submission.periodEnd}` } }, ...newFiles.map((file) => ({ actor: user, action: "Imported statement", type: "source_file", id: file.id, details: { fileName: file.fileName, rows: file.rowCount, source: file.source } })), { actor: user, action: "Auto-matched transactions", type: "reconciliation", id: reconId, details: { matched: matched.matches.length } }];
    setWorkspace((current) => ({ ...current, reconciliations: [{ ...newRecon, ...counts }, ...current.reconciliations], sourceFiles: [...newFiles, ...current.sourceFiles], transactions: [...newTransactions, ...current.transactions], auditLog: [...auditRows.reverse().reduce<AuditEntry[]>((entries, item) => [...entries, { id: crypto.randomUUID(), actorId: item.actor.id, actorName: item.actor.name, action: item.action, entityType: item.type, entityId: item.id, details: item.details, createdAt: timestamp }], []), ...current.auditLog] }));
    setSelectedReconciliationId(reconId);
    setView("exceptions");
    setNotice({ message: `${submission.files.length} source file${submission.files.length === 1 ? "" : "s"} imported. ${matched.matches.length} transaction pairs were matched automatically.` });
  }

  async function autoMatch(reconciliationId: string) {
    if (databaseConfigured) {
      const result = await apiRequest<{ matched: number }>(`/api/reconciliations/${reconciliationId}/auto-match`, { method: "POST" });
      await refreshWorkspace();
      setNotice({ message: `${result.matched} transaction pair${result.matched === 1 ? "" : "s"} matched. The remaining rows need review.` });
      return;
    }
    let resultCount = 0;
    setWorkspace((current) => {
      const result = matchTransactions(current.transactions.filter((item) => item.reconciliationId === reconciliationId));
      resultCount = result.matches.length;
      let transactions = [...current.transactions];
      for (const pair of result.matches) {
        const matchId = crypto.randomUUID();
        transactions = transactions.map((item) => item.id === pair.bank.id || item.id === pair.ledger.id ? { ...item, matchId } : item);
      }
      const counts = transactionCounts(transactions, reconciliationId);
      return { ...current, transactions, reconciliations: current.reconciliations.map((recon) => recon.id === reconciliationId ? { ...recon, ...counts, updatedAt: new Date().toISOString() } : recon), auditLog: addAudit(current, user!, "Auto-matched transactions", "reconciliation", reconciliationId, { matched: result.matches.length }) };
    });
    setNotice({ message: `${resultCount} transaction pair${resultCount === 1 ? "" : "s"} matched. The remaining rows need review.` });
  }

  async function manualMatch(reconciliationId: string, bank: StatementTransaction, ledger: StatementTransaction) {
    if (databaseConfigured) {
      await apiRequest(`/api/reconciliations/${reconciliationId}/matches`, { method: "POST", body: JSON.stringify({ bankTransactionId: bank.id, ledgerTransactionId: ledger.id }) });
      await refreshWorkspace();
      setNotice({ message: "Transactions were paired and the action was added to the audit trail." });
      return;
    }
    setWorkspace((current) => {
      const matchId = crypto.randomUUID();
      const transactions = current.transactions.map((item) => item.id === bank.id || item.id === ledger.id ? { ...item, matchId } : item);
      const counts = transactionCounts(transactions, reconciliationId);
      return { ...current, transactions, reconciliations: current.reconciliations.map((recon) => recon.id === reconciliationId ? { ...recon, ...counts, updatedAt: new Date().toISOString() } : recon), auditLog: addAudit(current, user!, "Manually matched transactions", "reconciliation", reconciliationId, { bankDescription: bank.description, ledgerDescription: ledger.description }) };
    });
    setNotice({ message: "Transactions were paired and the action was added to the audit trail." });
  }

  async function updateWorkflow(reconciliationId: string, action: WorkflowAction, note?: string) {
    if (databaseConfigured) {
      await apiRequest(`/api/reconciliations/${reconciliationId}/workflow`, { method: "PATCH", body: JSON.stringify({ action, note }) });
      await refreshWorkspace();
    } else {
      const recon = workspace.reconciliations.find((item) => item.id === reconciliationId);
      if (!recon || !user) throw new Error("Reconciliation not found.");
      if (action === "submit" || action === "approve") {
        const sourceSides = new Set(workspace.sourceFiles.filter((file) => file.reconciliationId === reconciliationId).map((file) => file.source));
        if (!sourceSides.has("bank") || !sourceSides.has("ledger")) throw new Error("Import at least one bank statement and one ledger file before review.");
      }
      if (action === "approve") {
        const counts = transactionCounts(workspace.transactions, reconciliationId);
        if (user.id === recon.preparerId) throw new Error("The preparer cannot approve their own reconciliation.");
        if (counts.unmatchedBankCount + counts.unmatchedLedgerCount || Math.round(recon.difference * 100) !== 0) throw new Error("Resolve all unmatched transactions and balance differences before approval.");
      }
      if (action === "return" && !note?.trim()) throw new Error("Add a review note describing the issue.");
      if (action === "approve" && !["admin", "reviewer"].includes(user.role)) throw new Error("Only a reviewer can approve a reconciliation.");
      if (action === "submit" && !["admin", "preparer"].includes(user.role)) throw new Error("Only a preparer can submit a reconciliation.");
      if (action === "approve" && recon.status !== "in_review") throw new Error("Submit this reconciliation before approving it.");
      if (action === "return" && (!["admin", "reviewer"].includes(user.role) || recon.status !== "in_review")) throw new Error("Only a reviewer can return a reconciliation in review.");
      const status = action === "submit" ? "in_review" : action === "approve" ? "approved" : "needs_attention";
      setWorkspace((current) => ({ ...current, reconciliations: current.reconciliations.map((item) => item.id === reconciliationId ? { ...item, status, reviewerId: action === "approve" || action === "return" ? user.id : undefined, reviewerName: action === "approve" || action === "return" ? user.name : undefined, updatedAt: new Date().toISOString() } : item), auditLog: addAudit(current, user, action === "submit" ? "Submitted reconciliation for review" : action === "approve" ? "Approved reconciliation" : "Returned reconciliation for changes", "reconciliation", reconciliationId, action === "return" ? { note } : {}) }));
    }
    setNotice({ message: action === "submit" ? "Reconciliation submitted for independent review." : action === "approve" ? "Reconciliation approved and locked." : "Reconciliation returned to the preparer." });
  }

  async function createUser(payload: CreateUserPayload) {
    if (!user) throw new Error("Sign in to continue.");
    if (databaseConfigured) {
      await apiRequest("/api/users", { method: "POST", body: JSON.stringify(payload) });
      await refreshWorkspace();
    } else {
      const nextUser: AppUser = { id: crypto.randomUUID(), name: payload.name.trim(), email: payload.email.trim().toLowerCase(), role: payload.role, active: true };
      setWorkspace((current) => ({ ...current, users: [...current.users, nextUser], auditLog: addAudit(current, user, "Created user", "user", nextUser.id, { email: nextUser.email, role: nextUser.role }) }));
    }
  }

  async function createAccount(payload: CreateAccountPayload) {
    if (!user) throw new Error("Sign in to continue.");
    if (databaseConfigured) {
      await apiRequest("/api/accounts", { method: "POST", body: JSON.stringify(payload) });
      await refreshWorkspace();
    } else {
      const account: Account = { id: crypto.randomUUID(), name: payload.name.trim(), institution: payload.institution.trim(), currency: payload.currency.trim().toUpperCase(), accountNumber: `•••• ${payload.accountNumber.slice(-4)}`, active: true };
      setWorkspace((current) => ({ ...current, accounts: [...current.accounts, account], auditLog: addAudit(current, user, "Created account", "account", account.id, { name: account.name, institution: account.institution, currency: account.currency }) }));
    }
  }

  async function updateUser(member: AppUser) {
    if (!user) return;
    const current = workspace.users.find((item) => item.id === member.id);
    if (!current) return;
    if (databaseConfigured) {
      const body: { role?: AppUser["role"]; active?: boolean } = {};
      if (current.role !== member.role) body.role = member.role;
      if (current.active !== member.active) body.active = member.active;
      await apiRequest(`/api/users/${member.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await refreshWorkspace();
    } else {
      setWorkspace((previous) => ({ ...previous, users: previous.users.map((item) => item.id === member.id ? member : item), auditLog: addAudit(previous, user, "Updated user access", "user", member.id, { role: member.role, active: member.active }) }));
    }
    setNotice({ message: `${member.name}'s access was updated.` });
  }

  async function updateOrganization(profile: OrganizationProfilePayload) {
    if (!databaseConfigured || !profile.id) throw new Error("Organization profile changes require a configured portal.");
    await apiRequest(`/api/organizations/${profile.id}`, { method: "PATCH", body: JSON.stringify(profile) });
    await refreshWorkspace();
    setNotice({ message: "Organization profile saved." });
  }

  async function downloadFile(file: SourceFile) {
    const response = await fetch(`/api/source-files/${file.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("The source document could not be downloaded.");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
  }

  function exportReport(rows: Reconciliation[]) {
    const headers = ["Account", "Institution", "Currency", "Period start", "Period end", "Statement balance", "Ledger balance", "Difference", "Status", "Matched pairs", "Unmatched bank", "Unmatched ledger", "Preparer", "Reviewer"];
    const cell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [headers, ...rows.map((row) => [row.accountName, row.institution, row.currency, row.periodStart, row.periodEnd, row.statementBalance, row.bookBalance, row.difference, row.status, row.matchedCount, row.unmatchedBankCount, row.unmatchedLedgerCount, row.preparerName, row.reviewerName ?? ""])].map((row) => row.map(cell).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ddin-reconciliation-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (databaseConfigured && !authReady) return <div className="login-screen"><div className="login-form-side"><div className="muted">Checking sign-in…</div></div></div>;
  if (databaseConfigured && !user) return <LoginScreen onLogin={login} />;
  if (databaseConfigured && user?.platformAdmin && !user.organizationId) return <PortalChooser user={user} organizations={organizations} onSelect={selectOrganization} onCreate={createOrganization} onLogout={logout} />;
  const currentUser = user ?? demoWorkspace.users[0];
  const titleByView: Record<ViewKey, string> = { overview: "Finance overview", reconciliations: "Reconciliation history", imports: "Statement imports", exceptions: "Review workbench", reports: "Period reports", audit: "Audit trail", team: "Finance administration" };
  const viewComponent = (() => {
    const base = { data: workspace, user: currentUser, onOpenReconciliation: openReconciliation, onNewImport: () => setImportOpen(true) };
    if (view === "overview") return <OverviewView {...base} />;
    if (view === "reconciliations") return <ReconciliationsView {...base} searchText={searchText} />;
    if (view === "imports") return <ImportsView {...base} databaseConfigured={databaseConfigured} onDownloadFile={(file) => void downloadFile(file).catch((error) => setNotice({ message: error.message, error: true }))} />;
    if (view === "exceptions") return <ExceptionsView {...base} selectedReconciliationId={selectedReconciliationId} onAutoMatch={autoMatch} onManualMatch={manualMatch} onWorkflow={updateWorkflow} />;
    if (view === "reports") return <ReportsView {...base} onExport={exportReport} />;
    if (view === "audit") return <AuditView {...base} />;
    return <TeamView {...base} onCreateUser={createUser} onCreateAccount={createAccount} onUpdateUser={updateUser} onUpdateOrganization={updateOrganization} />;
  })();

  return <div className="app-frame">
    <Sidebar view={view} onNavigate={changeView} data={workspace} open={mobileOpen} onClose={() => setMobileOpen(false)} currentUser={currentUser} />
    <main className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={17} /></button><div className="breadcrumb">{workspace.organization.name} Finance <ChevronRight size={11} style={{ verticalAlign: "-2px" }} /> <strong>{titleByView[view]}</strong></div></div><div className="topbar-right">
        <label className="global-search"><Search size={13} /><input aria-label="Search workspace" placeholder="Search accounts or periods" value={searchText} onChange={(event) => setSearchText(event.target.value)} onKeyDown={(event) => event.key === "Enter" && changeView("reconciliations")} /></label>
        <span className="top-date">{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date())}</span><span className="topbar-separator" />
        {isDemo && <span className="mode-chip"><span style={{ width: 5, height: 5, borderRadius: 4, background: "#ce8a31" }} /> Demo data</span>}
        {isDemo ? <select className="role-select" aria-label="Demo persona" value={currentUser.id} onChange={(event) => { const next = workspace.users.find((item) => item.id === event.target.value); if (next) setUser(next); }}><option value={demoWorkspace.users[0].id}>Aline · Preparer</option><option value={demoWorkspace.users[1].id}>Eric · Reviewer</option><option value={demoWorkspace.users[2].id}>Joseph · Admin</option><option value={demoWorkspace.users[3].id}>Claudine · Auditor</option></select> : <div className="topbar-user"><span className="avatar" style={{ width: 27, height: 27 }}>{initials(currentUser.name)}</span><span className="topbar-user-name">{currentUser.name}</span></div>}
        {databaseConfigured && user?.platformAdmin && <button className="btn btn-small" onClick={() => void switchToPortalDirectory()}>Portals</button>}
        {databaseConfigured && <button className="icon-button" title="Sign out" onClick={() => void logout()}><LogOut size={14} /></button>}
      </div></header>
      <section className="content">{viewComponent}</section>
    </main>
    {importOpen && <ImportDialog accounts={workspace.accounts} onClose={() => setImportOpen(false)} onSave={saveImport} />}
    {notice && <div className={`notice ${notice.error ? "error" : ""}`} role="status">{notice.error ? <AlertCircle size={14} /> : <ClipboardCheck size={14} />}{notice.message}</div>}
  </div>;
}
