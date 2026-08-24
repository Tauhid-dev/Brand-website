import { operationalQueueAction, reconcileCommercialNotificationsAction, reconcileOperationalQueuesAction } from "@/app/portal-actions";
import { ConfirmAction, DataTable, MetricGrid, Panel, PortalShell } from "@/components/Portal";
import { adminPortalSession, portalReadRepository } from "../../portal-server";

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage() {
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_READ");
  const operations = await (await portalReadRepository()).getOperations();
  const canManage = principal.permissions.has("OPERATIONS_WRITE");
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
    {canManage ? <Panel title="Recovery controls"><div className="portal-inline-actions"><ConfirmAction action={reconcileOperationalQueuesAction} label="Reconcile work queues"><p>Rebuild missing work and close stale projections from current source records.</p></ConfirmAction><ConfirmAction action={reconcileCommercialNotificationsAction} label="Queue required notifications"><p>Queue idempotent commercial messages. This does not contact an external provider.</p></ConfirmAction></div></Panel> : null}
    <Panel title="What requires attention today?"><DataTable rows={queues} columns={[["workKind", "Work type"], ["customerName", "Customer"], ["title", "Item"], ["status", "Status"], ["priority", "Priority"], ["dueAt", "Due"], ["actions", "Actions"]]} /></Panel>
    <Panel title="Notification delivery records"><DataTable rows={operations.deliveries} columns={[["code", "Notification"], ["channel", "Channel"], ["status", "Status"], ["recipientId", "Recipient"], ["attemptHistory", "Attempts"], ["scheduledFor", "Scheduled"], ["sentAt", "Sent"]]} /></Panel>
    <Panel title="Active templates"><DataTable rows={operations.templates} columns={[["code", "Notification"], ["channel", "Channel"], ["version", "Version"], ["requiredServiceNotice", "Required"], ["updatedAt", "Published"]]} /></Panel>
  </PortalShell>;
}

function QueueAction({ itemId, operation, label }: { itemId: string; operation: "CLAIM" | "COMPLETE" | "DISMISS"; label: string }) {
  return <ConfirmAction action={operationalQueueAction} label={label}><input type="hidden" name="itemId" value={itemId} /><input type="hidden" name="operation" value={operation} /></ConfirmAction>;
}
