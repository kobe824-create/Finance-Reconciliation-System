export type UserRole = "admin" | "preparer" | "reviewer" | "auditor";
export type ReconciliationStatus = "draft" | "in_review" | "approved" | "needs_attention";
export type TransactionSource = "bank" | "ledger";

export type Account = {
  id: string;
  name: string;
  institution: string;
  currency: string;
  accountNumber: string;
  active: boolean;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  platformAdmin?: boolean;
  organizationId?: string | null;
};

export type OrganizationProfile = {
  id: string;
  slug: string;
  name: string;
  legalName?: string;
  tagline?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  logoUrl?: string;
};

export type OrganizationSummary = OrganizationProfile & { active: boolean };

export type Reconciliation = {
  id: string;
  accountId: string;
  accountName: string;
  institution: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  statementBalance: number;
  bookBalance: number;
  status: ReconciliationStatus;
  preparerId: string;
  preparerName: string;
  reviewerId?: string;
  reviewerName?: string;
  reviewerNote?: string;
  createdAt: string;
  updatedAt: string;
  matchedCount: number;
  unmatchedBankCount: number;
  unmatchedLedgerCount: number;
  difference: number;
};

export type StatementTransaction = {
  id: string;
  reconciliationId: string;
  sourceFileId?: string;
  source: TransactionSource;
  date: string;
  description: string;
  reference?: string;
  amount: number;
  currency: string;
  matchId?: string;
};

export type SourceFile = {
  id: string;
  reconciliationId: string;
  fileName: string;
  source: TransactionSource;
  rowCount: number;
  fileSize: number;
  sha256: string;
  importedAt: string;
  uploadedBy: string;
  importComplete: boolean;
};

export type AuditEntry = {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type WorkspaceData = {
  organization: OrganizationProfile;
  accounts: Account[];
  users: AppUser[];
  reconciliations: Reconciliation[];
  transactions: StatementTransaction[];
  sourceFiles: SourceFile[];
  auditLog: AuditEntry[];
};
