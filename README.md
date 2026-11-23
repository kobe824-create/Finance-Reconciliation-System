# DDIN Finance Reconciliation

A single-project Next.js and TypeScript finance workspace for monthly bank-to-ledger reconciliation. The web interface, API routes, session handling, and Neon data access run from one Vercel project. There is no separately hosted backend.

## Included

- Multiple CSV, Excel, or selectable-text PDF files per reconciliation, with each file assigned to the bank or ledger side.
- Client-side parsing and preview, transaction date/amount normalization, SHA-256 checksums, and original-file retention in Neon PostgreSQL.
- Conservative one-to-one matching by exact amount plus normalized reference, or exact amount plus a similar description on the same posting date. Other rows stay in the exception queue for review and manual matching.
- Role-based access for administrators, preparers, reviewers, and auditors. A preparer cannot approve their own reconciliation; approval requires no unmatched transactions and equal statement and ledger closing balances.
- Review return notes, period-based account reports, CSV export, browser print-to-PDF, searchable history, and append-only database audit events.
- A local demo workspace with sample records. Without `DATABASE_URL`, demo changes stay in that browser's local storage and no credentials are required.

## Local setup

Use Node.js 24.x. For real data, create a Neon project and use its pooled PostgreSQL connection string.

1. Copy `.env.example` to `.env.local`.
2. Set `DATABASE_URL` and generate `AUTH_SECRET` with `openssl rand -base64 48`.
3. Choose a first-admin name, email, and temporary password of at least 12 characters in the `BOOTSTRAP_ADMIN_*` values.
4. Install packages, apply the schema, and create the first administrator:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed-admin
   ```

5. Remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env.local` after the first administrator is created, then start the application:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000` and sign in with the first-admin email and password. `db:seed-admin` is intentionally one-time and refuses to run once any user exists. It also creates three masked sample bank-account records; add the company's real accounts from **Team & settings**.

To use the sample workspace without a database, leave `DATABASE_URL` unset and run `npm run dev`. If `DATABASE_URL` is present, the application requires a configured database and a seeded user.

## Imports and storage

The interface accepts `.csv`, `.xlsx`, and text-based `.pdf` files up to 2.5 MB each. Each file is parsed in the browser, its original bytes are saved to a `bytea` column in Neon, and normalized transactions are inserted in batches of 500. The API validates file signatures, allowed extensions, row shape, currency, row count, and checksum. It limits each source file to 5,000 transaction rows and each reconciliation import to 10,000 rows.

CSV and workbook headers are detected using common date, description, reference, debit, credit, and amount labels. Ambiguous dates use DD/MM/YYYY when entered with slashes, matching DDIN's locale. Review the preview before saving. PDFs must contain selectable text; image-only scans and OCR are not supported. Statement layouts vary, so an unusual export may need its columns renamed before import.

Original files are retained in Neon rather than Vercel's temporary function filesystem. A file download is served only to a signed-in user. Confirm the company's source-document retention period and Neon backup plan before loading live records.

## Roles and controls

| Role | Access |
| --- | --- |
| Administrator | Manage users and accounts; prepare and review periods |
| Preparer | Create reconciliations, import sources, and match transactions |
| Reviewer | Independently approve or return periods in review |
| Auditor | Read history, audit events, reports, and source files |

Submission requires at least one completed bank file and one completed ledger file. Approval is blocked when the statement and ledger closing balances differ or any imported transaction remains unmatched. Unmatched items therefore require review or a documented follow-up before the period can be approved. Audit events are protected by a database trigger against update and deletion through ordinary SQL statements.

## Vercel deployment

1. Push this folder to a Git repository and import it into Vercel. Vercel detects the Next.js project and uses the Next.js build defaults.
2. Create or connect a Neon database. Run the schema migration once from a local terminal connected to the production Neon database: `npm run db:migrate`.
3. Create the first administrator once against that database with `npm run db:seed-admin`. Do not add the bootstrap password to Vercel; remove it from the local environment after the account is created.
4. Add `DATABASE_URL` and a unique `AUTH_SECRET` in the Vercel project settings for Preview and Production as appropriate. Redeploy after changing environment variables.
5. Deploy from the Vercel dashboard or run `npx vercel --prod` from this project directory.

Use separate Neon branches or databases for preview and production so preview imports cannot alter live finance data. Keep `.env.local` out of Git; `.env.example` contains placeholders only.

## Commands

```bash
npm run dev          # local development
npm run lint         # static lint checks
npm test             # matching and normalization unit tests
npm run build        # production build
npm run db:migrate   # apply the initial SQL schema once
npm run db:seed-admin # create the first administrator once
```

## Current limits before a production rollout

- Matching is one-to-one and deliberately conservative; it does not yet support split/aggregate matches, bank-feed integrations, or journal-entry generation.
- PDF extraction depends on a machine-readable text layer. Scanned documents need an OCR workflow outside this project.
- There is no password reset, MFA, SSO, or email delivery for temporary credentials. An administrator must deliver temporary passwords privately and manage access changes.
- Authentication failures are rate-limited per normalized email and forwarded IP in the database. Confirm the proxy configuration and operational lockout policy before launch.
- No organization-specific accounting policy, approval threshold, reconciliation checklist, or statutory retention period has been supplied; configure these with DDIN Finance before production use.
- The seeded demo dashboard is illustrative. It is not DDIN's live ledger or an audited financial report.

## Research references

- The reconciliation workflow reflects documented internal-control guidance about independent review, retaining support, following up open items, and investigating unexplained differences: [Indiana State Board of Accounts](https://www.in.gov/sboa/library/best-practices/) and the [Catholic Relief Services Institutional Strengthening Guide, Chapter 6: Finance](https://ics.crs.org/resource/institutional-strengthening-guide-chapter-6-finance).
- The single-project server/API layout uses [Next.js App Router Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), and Vercel's deployment path is documented in [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).
- Neon documents its HTTP query driver and batch transaction API in the [`@neondatabase/serverless` guide](https://github.com/neondatabase/serverless#sessions-transactions-and-node-postgres-compatibility).
- The import validation follows OWASP's guidance to allow-list file types, verify contents, and limit upload sizes: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
