import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Portals | Reconciliation",
  description: "Organization finance workspaces for statement imports, review, approvals, and period reporting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
