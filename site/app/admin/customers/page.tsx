import Link from "next/link";
import { DataTable, Panel, PortalShell } from "@/components/Portal";
import { adminPortalSession, portalReadRepository } from "../../portal-server";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; subscription?: string }> }) {
  const principal = await adminPortalSession("/admin/customers", "CUSTOMER_READ");
  const filters = await searchParams;
  const rows = await (await portalReadRepository()).searchCustomers({ query: filters.q, subscriptionStatus: filters.subscription });
  return <PortalShell kind="Admin" title="Customers" subtitle="Search customer, contact and subscription records." user={principal.displayName}>
    <Panel title="Customer search"><form className="portal-search"><label><span>Search</span><input name="q" defaultValue={filters.q} placeholder="Business, email, phone, ID or reference" /></label><label><span>Subscription</span><select name="subscription" defaultValue={filters.subscription ?? ""}><option value="">All</option>{["PENDING", "TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}</select></label><button className="button small">Search</button></form></Panel>
    <Panel title={`${rows.length} customer${rows.length === 1 ? "" : "s"}`}><DataTable rows={rows.map((row) => ({ ...row, business: <Link className="portal-link" href={`/admin/customers/${row.id}`}>{row.businessName}</Link> }))} columns={[["business", "Business"], ["externalReference", "Reference"], ["contactName", "Contact"], ["email", "Email"], ["status", "Lifecycle"], ["subscriptionStatus", "Subscription"]]} /></Panel>
  </PortalShell>;
}
