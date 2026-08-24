import { notFound } from "next/navigation";
import { ConfirmAction, DataTable, Field, MetricGrid, Panel, PortalShell, Status } from "@/components/Portal";
import { markInAppNotificationReadAction, setNotificationPreferenceAction } from "@/app/portal-actions";
import { CustomerPortalQueryService } from "@/modules/portal/application/portal-access";
import { customerBillingOverview, customerPortalSession, portalReadRepository } from "../portal-server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const principal = await customerPortalSession();
  const [account, billing] = await Promise.all([
    new CustomerPortalQueryService(await portalReadRepository()).execute(principal),
    customerBillingOverview(principal.customerId),
  ]);
  if (!account) notFound();
  const completedTasks = account.onboarding?.tasks.filter((task) => task.status === "COMPLETED").length ?? 0;
  const notifications = account.inAppNotifications.map((row) => ({ ...row, readStatus: row.readAt ? "READ" : "UNREAD", action: row.readAt ? "—" : <ConfirmAction action={markInAppNotificationReadAction} label="Mark read"><input type="hidden" name="deliveryId" value={String(row.id)} /></ConfirmAction> }));
  return <PortalShell kind="Customer" title={`Welcome, ${account.customer.contactName}`} subtitle={`${account.customer.businessName} · ${account.customer.externalReference}`} user={principal.email}>
    <MetricGrid items={[["Account status", account.customer.status], ["Subscription", account.customer.subscriptionStatus ?? "Not started"], ["Plan", account.customer.planName ?? "Not selected"], ["Onboarding tasks", `${completedTasks}/${account.onboarding?.tasks.length ?? 0}`]]} />
    <div className="portal-grid">
      <Panel title="Account overview"><dl className="portal-details"><div><dt>Business</dt><dd>{account.customer.businessName}</dd></div><div><dt>Contact</dt><dd>{account.customer.contactName}</dd></div><div><dt>Email</dt><dd>{account.customer.email}</dd></div><div><dt>Industry</dt><dd>{account.customer.industry ?? "—"}</dd></div></dl></Panel>
      <Panel title="Subscription & entitlements"><p><Status value={account.subscription?.status ?? "NOT_STARTED"} /></p><DataTable rows={account.entitlements} columns={[["offeringCode", "Offering"], ["status", "Status"], ["effectiveFrom", "Effective from"]]} /></Panel>
    </div>
    <Panel id="onboarding" title="Onboarding"><p>Current lifecycle: <Status value={account.onboarding?.status ?? "NOT_STARTED"} /></p><DataTable rows={account.onboarding?.tasks ?? []} columns={[["title", "Task"], ["ownerType", "Owner"], ["status", "Status"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Integrations & agent"><DataTable rows={[...account.integrations, ...account.agentLinks]} columns={[["integrationCode", "Integration"], ["agentPlatform", "Agent platform"], ["status", "Status"], ["updatedAt", "Updated"]]} /></Panel>
    <Panel id="billing" title="Billing"><dl className="portal-details"><div><dt>Payment state</dt><dd><Status value={billing.paymentState} /></dd></div><div><dt>Entitlement state</dt><dd><Status value={billing.entitlementState} /></dd></div><div><dt>Effective recurring price</dt><dd>{billing.pricing ? new Intl.NumberFormat("en-AU", { style: "currency", currency: billing.pricing.currency }).format(billing.pricing.effectivePriceMinor / 100) : "—"}</dd></div><div><dt>Renewal / cancellation date</dt><dd>{billing.subscription?.cancelAt?.toLocaleDateString("en-AU") ?? billing.subscription?.currentPeriodEnd?.toLocaleDateString("en-AU") ?? "—"}</dd></div><div><dt>Billing contact</dt><dd>{billing.profile ? `${billing.profile.contactName} · ${billing.profile.contactEmail.value}` : "Uses the primary account contact"}</dd></div></dl><DataTable rows={account.invoices} columns={[["invoiceNumber", "Invoice"], ["status", "Status"], ["amountDueMinor", "Amount due (minor units)"], ["dueAt", "Due"], ["paidAt", "Paid"]]} /><DataTable rows={account.reminders} columns={[["invoiceNumber", "Invoice"], ["stage", "Stage"], ["status", "Reminder status"], ["scheduledFor", "Scheduled"]]} /></Panel>
    <Panel id="notifications" title="Notifications"><DataTable rows={notifications} columns={[["subject", "Notification"], ["body", "Message"], ["sentAt", "Sent"], ["readStatus", "Status"], ["action", "Action"]]} /><h3>Preferences</h3><DataTable rows={account.notificationPreferences} columns={[["notificationCode", "Notification"], ["channel", "Channel"], ["status", "Preference"]]} /><ConfirmAction action={setNotificationPreferenceAction} label="Update preference"><Field name="code" label="Notification code" /><Field name="channel" label="Channel"><select name="channel" required><option>EMAIL</option><option>SMS</option><option>WHATSAPP</option><option>IN_APP</option></select></Field><Field name="status" label="Preference"><select name="status" required><option>OPTED_IN</option><option>OPTED_OUT</option></select></Field></ConfirmAction></Panel>
  </PortalShell>;
}
