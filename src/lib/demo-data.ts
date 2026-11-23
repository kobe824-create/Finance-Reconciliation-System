import type { Account, AppUser, AuditEntry, Reconciliation, SourceFile, StatementTransaction, WorkspaceData } from "@/lib/types";

export const demoUsers: AppUser[] = [
  { id: "usr-aline", name: "Aline Mukamana", email: "aline.mukamana@ddin.rw", role: "preparer", active: true },
  { id: "usr-eric", name: "Eric Niyonzima", email: "eric.niyonzima@ddin.rw", role: "reviewer", active: true },
  { id: "usr-joseph", name: "Joseph Habimana", email: "joseph.habimana@ddin.rw", role: "admin", active: true },
  { id: "usr-claudine", name: "Claudine Uwase", email: "claudine.uwase@ddin.rw", role: "auditor", active: true },
];

export const demoAccounts: Account[] = [
  { id: "acc-operating", name: "Operating account · 0041", institution: "Bank of Kigali", currency: "RWF", accountNumber: "•••• 0041", active: true },
  { id: "acc-project", name: "Project account · 1826", institution: "I&M Bank Rwanda", currency: "RWF", accountNumber: "•••• 1826", active: true },
  { id: "acc-usd", name: "USD holding · 9035", institution: "Bank of Kigali", currency: "USD", accountNumber: "•••• 9035", active: true },
];

export const demoReconciliations: Reconciliation[] = [
  { id: "rec-nov-operating", accountId: "acc-operating", accountName: "Operating account · 0041", institution: "Bank of Kigali", currency: "RWF", periodStart: "2026-11-01", periodEnd: "2026-11-30", statementBalance: 18460000, bookBalance: 18442500, status: "draft", preparerId: "usr-aline", preparerName: "Aline Mukamana", createdAt: "2026-11-20T09:10:00Z", updatedAt: "2026-11-23T08:42:00Z", matchedCount: 18, unmatchedBankCount: 2, unmatchedLedgerCount: 1, difference: 17500 },
  { id: "rec-oct-operating", accountId: "acc-operating", accountName: "Operating account · 0041", institution: "Bank of Kigali", currency: "RWF", periodStart: "2026-10-01", periodEnd: "2026-10-31", statementBalance: 17284000, bookBalance: 17284000, status: "approved", preparerId: "usr-aline", preparerName: "Aline Mukamana", reviewerId: "usr-eric", reviewerName: "Eric Niyonzima", createdAt: "2026-11-03T10:12:00Z", updatedAt: "2026-11-05T14:26:00Z", matchedCount: 47, unmatchedBankCount: 0, unmatchedLedgerCount: 0, difference: 0 },
  { id: "rec-oct-project", accountId: "acc-project", accountName: "Project account · 1826", institution: "I&M Bank Rwanda", currency: "RWF", periodStart: "2026-10-01", periodEnd: "2026-10-31", statementBalance: 8903500, bookBalance: 8878500, status: "needs_attention", preparerId: "usr-aline", preparerName: "Aline Mukamana", createdAt: "2026-11-02T12:05:00Z", updatedAt: "2026-11-04T16:31:00Z", matchedCount: 31, unmatchedBankCount: 1, unmatchedLedgerCount: 1, difference: 25000 },
  { id: "rec-sep-operating", accountId: "acc-operating", accountName: "Operating account · 0041", institution: "Bank of Kigali", currency: "RWF", periodStart: "2026-09-01", periodEnd: "2026-09-30", statementBalance: 16012500, bookBalance: 16012500, status: "approved", preparerId: "usr-aline", preparerName: "Aline Mukamana", reviewerId: "usr-eric", reviewerName: "Eric Niyonzima", createdAt: "2026-10-04T08:30:00Z", updatedAt: "2026-10-06T11:15:00Z", matchedCount: 52, unmatchedBankCount: 0, unmatchedLedgerCount: 0, difference: 0 },
];

export const demoTransactions: StatementTransaction[] = [
  { id: "txn-b-1", reconciliationId: "rec-nov-operating", sourceFileId: "file-bank-nov", source: "bank", date: "2026-11-03", description: "Incoming transfer · project settlement", reference: "TX-4481", amount: 2500000, currency: "RWF", matchId: "match-1" },
  { id: "txn-l-1", reconciliationId: "rec-nov-operating", sourceFileId: "file-ledger-nov", source: "ledger", date: "2026-11-03", description: "Project settlement", reference: "TX4481", amount: 2500000, currency: "RWF", matchId: "match-1" },
  { id: "txn-b-2", reconciliationId: "rec-nov-operating", sourceFileId: "file-bank-nov", source: "bank", date: "2026-11-04", description: "Monthly account service charge", reference: "FEE-1104", amount: -12500, currency: "RWF" },
  { id: "txn-b-3", reconciliationId: "rec-nov-operating", sourceFileId: "file-bank-nov", source: "bank", date: "2026-11-05", description: "Office rent · November", reference: "CHQ-182", amount: -750000, currency: "RWF", matchId: "match-2" },
  { id: "txn-l-2", reconciliationId: "rec-nov-operating", sourceFileId: "file-ledger-nov", source: "ledger", date: "2026-11-05", description: "Rent - November office", reference: "CHQ182", amount: -750000, currency: "RWF", matchId: "match-2" },
  { id: "txn-b-4", reconciliationId: "rec-nov-operating", sourceFileId: "file-bank-nov", source: "bank", date: "2026-11-07", description: "Cash collection · Huye office", reference: "DEP-8792", amount: 1850000, currency: "RWF", matchId: "match-3" },
  { id: "txn-l-3", reconciliationId: "rec-nov-operating", sourceFileId: "file-ledger-nov", source: "ledger", date: "2026-11-07", description: "Cash collection Huye", reference: "DEP8792", amount: 1850000, currency: "RWF", matchId: "match-3" },
  { id: "txn-l-4", reconciliationId: "rec-nov-operating", sourceFileId: "file-ledger-nov", source: "ledger", date: "2026-11-10", description: "Field travel advance · Southern Province", reference: "JV-0638", amount: -120000, currency: "RWF" },
  { id: "txn-b-5", reconciliationId: "rec-nov-operating", sourceFileId: "file-bank-nov", source: "bank", date: "2026-11-12", description: "Mobile transfer · N. Karemera", reference: "MOB-17803", amount: -84000, currency: "RWF" },
  { id: "txn-b-6", reconciliationId: "rec-oct-project", sourceFileId: "file-bank-oct-project", source: "bank", date: "2026-10-28", description: "Electronic transfer received", reference: "TR-2210", amount: 25000, currency: "RWF" },
  { id: "txn-l-6", reconciliationId: "rec-oct-project", sourceFileId: "file-ledger-oct-project", source: "ledger", date: "2026-10-28", description: "Grant installment", reference: "GR-97", amount: 0, currency: "RWF" },
];

export const demoSourceFiles: SourceFile[] = [
  { id: "file-bank-nov", reconciliationId: "rec-nov-operating", fileName: "BK_Operating_Nov_2026.csv", source: "bank", rowCount: 24, fileSize: 18542, sha256: "demo-source-bank-nov", importedAt: "2026-11-20T09:14:00Z", uploadedBy: "usr-aline", importComplete: true },
  { id: "file-ledger-nov", reconciliationId: "rec-nov-operating", fileName: "Cashbook_Nov_2026.xlsx", source: "ledger", rowCount: 23, fileSize: 41288, sha256: "demo-source-ledger-nov", importedAt: "2026-11-20T09:18:00Z", uploadedBy: "usr-aline", importComplete: true },
  { id: "file-bank-oct-project", reconciliationId: "rec-oct-project", fileName: "IM_Project_Oct_2026.pdf", source: "bank", rowCount: 33, fileSize: 218408, sha256: "demo-source-bank-project-oct", importedAt: "2026-11-02T12:12:00Z", uploadedBy: "usr-aline", importComplete: true },
  { id: "file-ledger-oct-project", reconciliationId: "rec-oct-project", fileName: "Project_Ledger_Oct_2026.xlsx", source: "ledger", rowCount: 32, fileSize: 36920, sha256: "demo-source-ledger-project-oct", importedAt: "2026-11-02T12:16:00Z", uploadedBy: "usr-aline", importComplete: true },
];

export const demoAuditLog: AuditEntry[] = [
  { id: "audit-1", actorId: "usr-eric", actorName: "Eric Niyonzima", action: "Approved reconciliation", entityType: "reconciliation", entityId: "rec-oct-operating", details: { period: "October 2026", account: "Operating account · 0041" }, createdAt: "2026-11-05T14:26:00Z" },
  { id: "audit-2", actorId: "usr-aline", actorName: "Aline Mukamana", action: "Imported statement", entityType: "source_file", entityId: "file-bank-nov", details: { fileName: "BK_Operating_Nov_2026.csv", rows: 24 }, createdAt: "2026-11-20T09:14:00Z" },
  { id: "audit-3", actorId: "usr-aline", actorName: "Aline Mukamana", action: "Created reconciliation", entityType: "reconciliation", entityId: "rec-nov-operating", details: { period: "November 2026", account: "Operating account · 0041" }, createdAt: "2026-11-20T09:10:00Z" },
  { id: "audit-4", actorId: "usr-aline", actorName: "Aline Mukamana", action: "Matched transactions", entityType: "reconciliation", entityId: "rec-nov-operating", details: { matchCount: 18, method: "rule-based" }, createdAt: "2026-11-20T09:22:00Z" },
];

export const demoWorkspace: WorkspaceData = {
  organization: { id: "demo-ddin", slug: "ddin", name: "DDIN", legalName: "DDIN", tagline: "Network of the Best", country: "Rwanda", logoUrl: "/ddin-logo.png" },
  accounts: demoAccounts,
  users: demoUsers,
  reconciliations: demoReconciliations,
  transactions: demoTransactions,
  sourceFiles: demoSourceFiles,
  auditLog: demoAuditLog,
};
