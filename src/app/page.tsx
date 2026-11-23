import FinanceWorkspace from "@/components/finance-workspace";
import { databaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function Home() {
  return <FinanceWorkspace databaseConfigured={databaseConfigured()} />;
}
