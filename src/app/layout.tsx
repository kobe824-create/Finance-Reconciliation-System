import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DDIN Finance | Reconciliation",
  description: "DDIN finance reconciliation workspace for imports, review, approvals, and period reporting.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
