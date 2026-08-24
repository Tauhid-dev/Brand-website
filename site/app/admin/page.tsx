import Link from "next/link";
import { DataTable, MetricGrid, Panel, PortalShell } from "@/components/Portal";
import { adminPortalSession, portalReadRepository } from "../portal-server";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const principal = await adminPortalSession("/admin", "CUSTOMER_READ");
  const dashboard = await (await portalReadRepository()).getAdminDashboard();
  return <PortalShell kind="Admin" title="Commercial operations" subtitle="Customers, fulfilment, billing and agent provisioning in one controlled workspace." user={principal.displayName}>
    <MetricGrid items={[["Attention today", dashboard.metrics.attentionToday], ["Overdue work", dashboard.metrics.overdueWork], ["Customers", dashboard.metrics.customers], ["Current subscriptions", dashboard.metrics.currentSubscriptions], ["Open queue items", dashboard.metrics.openQueueItems]]} />
    <Panel title="What requires attention today?"><DataTable rows={dashboard.queues} columns={[["queueType", "Queue"], ["title", "Item"], ["status", "Status"], ["priority", "Priority"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Recent customers"><DataTable rows={dashboard.recentCustomers.map((row) => ({ ...row, customer: <Link href={`/admin/customers/${row.id}`}>{row.businessName}</Link> }))} columns={[["customer", "Customer"], ["contactName", "Contact"], ["status", "Lifecycle"], ["subscriptionStatus", "Subscription"], ["createdAt", "Created"]]} /></Panel>
  </PortalShell>;
}
