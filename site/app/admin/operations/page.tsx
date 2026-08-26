import { operationalQueueAction, reconcileCommercialNotificationsAction, reconcileOperationalQueuesAction, runSystemMaintenanceAction } from "@/app/portal-actions";
import { ConfirmAction, DataTable, MetricGrid, Panel, PortalShell } from "@/components/Portal";
import { actionRuntime, adminPortalSession, portalReadRepository } from "../../portal-server";
import { systemHardeningServices } from "../../system-hardening-runtime";

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_READ");
  const operations = await (await portalReadRepository()).getOperations();
  const canManage = principal.permissions.has("OPERATIONS_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  const readiness = await systemHardeningServices(runtime, runtime.audit).readiness.execute();
  const queues = operations.queues.map((row) => ({
    ...row,
    actions: canManage ? <div className="portal-inline-actions">
      {row.status === "OPEN" ? <QueueAction itemId={String(row.id)} operation="CLAIM" label="Claim" /> : null}
      <QueueAction itemId={String(row.id)} operation="COMPLETE" label="Complete" />
      <QueueAction itemId={String(row.id)} operation="DISMISS" label="Dismiss" />
    </div> : "Read only",
  }));
  return <PortalShell kind="Admin" title="Operational attention" subtitle="A reconciled view of customer, onboarding, billing, integration and agent work that needs action." user={principal.displayName}>
    <MetricGrid items={[["Attention today", operations.metrics.attentionToday], ["Overdue work", operations.metrics.overdueWork], ["Unclaimed work", operations.metrics.unclaimedWork], ["Failed notifications", operations.metrics.failedDeliveries], ["Deliveries processing", operations.metrics.processingDeliveries]]} />
    <Panel title="Production readiness"><MetricGrid items={[["System status", readiness.status], ["Webhook retries ready", readiness.backlog.billingWebhooksReady], ["Terminal webhooks", readiness.backlog.billingWebhooksTerminal], ["Expired worker leases", readiness.backlog.notificationLeasesExpired + readiness.backlog.agentLeasesExpired], ["Last maintenance", readiness.lastSuccessfulMaintenanceAt?.toLocaleString("en-AU") ?? "Never"]]} /></Panel>
    {canManage ? <Panel title="Recovery controls"><div className="portal-inline-actions"><ConfirmAction action={reconcileOperationalQueuesAction} label="Reconcile work queues"><p>Rebuild missing work and close stale projections from current source records.</p></ConfirmAction><ConfirmAction action={reconcileCommercialNotificationsAction} label="Queue required notifications"><p>Queue idempotent commercial messages. This does not contact an external provider.</p></ConfirmAction><ConfirmAction action={runSystemMaintenanceAction} label="Run system maintenance"><p>Expire stale checkout sessions, remove expired technical keys and rate-limit windows, redact aged network metadata and retry ready billing events.</p></ConfirmAction></div></Panel> : null}
    <Panel title="What requires attention today?"><DataTable rows={queues} columns={[["workKind", "Work type"], ["customerName", "Customer"], ["title", "Item"], ["status", "Status"], ["priority", "Priority"], ["dueAt", "Due"], ["actions", "Actions"]]} /></Panel>
    <Panel title="Notification delivery records"><DataTable rows={operations.deliveries} columns={[["code", "Notification"], ["channel", "Channel"], ["status", "Status"], ["recipientId", "Recipient"], ["attemptHistory", "Attempts"], ["scheduledFor", "Scheduled"], ["sentAt", "Sent"]]} /></Panel>
    <Panel title="Active templates"><DataTable rows={operations.templates} columns={[["code", "Notification"], ["channel", "Channel"], ["version", "Version"], ["requiredServiceNotice", "Required"], ["updatedAt", "Published"]]} /></Panel>
  </PortalShell>;
}

function QueueAction({ itemId, operation, label }: { itemId: string; operation: "CLAIM" | "COMPLETE" | "DISMISS"; label: string }) {
  return <ConfirmAction action={operationalQueueAction} label={label}><input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="operation" value={operation} /></ConfirmAction>;
}
