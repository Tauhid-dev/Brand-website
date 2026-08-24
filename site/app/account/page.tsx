import { notFound } from "next/navigation";
import { ConfirmAction, DataTable, Field, MetricGrid, Panel, PortalShell, Status } from "@/components/Portal";
import { setNotificationPreferenceAction } from "@/app/portal-actions";
import { CustomerPortalQueryService } from "@/modules/portal/application/portal-access";
import { customerPortalSession, portalReadRepository } from "../portal-server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const principal = await customerPortalSession();
  const account = await new CustomerPortalQueryService(await portalReadRepository()).execute(principal);
  if (!account) notFound();
  const completedTasks = account.onboarding?.tasks.filter((task) => task.status === "COMPLETED").length ?? 0;
  return <PortalShell kind="Customer" title={`Welcome, ${account.customer.contactName}`} subtitle={`${account.customer.businessName} · ${account.customer.externalReference}`} user={principal.email}>
    <MetricGrid items={[["Account status", account.customer.status], ["Subscription", account.customer.subscriptionStatus ?? "Not started"], ["Plan", account.customer.planName ?? "Not selected"], ["Onboarding tasks", `${completedTasks}/${account.onboarding?.tasks.length ?? 0}`]]} />
    <div className="portal-grid">
      <Panel title="Account overview"><dl className="portal-details"><div><dt>Business</dt><dd>{account.customer.businessName}</dd></div><div><dt>Contact</dt><dd>{account.customer.contactName}</dd></div><div><dt>Email</dt><dd>{account.customer.email}</dd></div><div><dt>Industry</dt><dd>{account.customer.industry ?? "—"}</dd></div></dl></Panel>
      <Panel title="Subscription & entitlements"><p><Status value={account.subscription?.status ?? "NOT_STARTED"} /></p><DataTable rows={account.entitlements} columns={[["offeringCode", "Offering"], ["status", "Status"], ["effectiveFrom", "Effective from"]]} /></Panel>
    </div>
    <Panel id="onboarding" title="Onboarding"><p>Current lifecycle: <Status value={account.onboarding?.status ?? "NOT_STARTED"} /></p><DataTable rows={account.onboarding?.tasks ?? []} columns={[["title", "Task"], ["ownerType", "Owner"], ["status", "Status"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Integrations & agent"><DataTable rows={[...account.integrations, ...account.agentLinks]} columns={[["integrationCode", "Integration"], ["agentPlatform", "Agent platform"], ["status", "Status"], ["updatedAt", "Updated"]]} /></Panel>
    <Panel id="billing" title="Invoices & reminders"><DataTable rows={account.invoices} columns={[["invoiceNumber", "Invoice"], ["status", "Status"], ["totalMinor", "Total (minor units)"], ["dueAt", "Due"]]} /><DataTable rows={account.reminders} columns={[["invoiceNumber", "Invoice"], ["status", "Reminder status"], ["scheduledFor", "Scheduled"]]} /></Panel>
    <Panel id="notifications" title="Notification preferences"><DataTable rows={account.notificationPreferences} columns={[["notificationCode", "Notification"], ["channel", "Channel"], ["status", "Preference"]]} /><ConfirmAction action={setNotificationPreferenceAction} label="Update preference"><Field name="code" label="Notification code" /><Field name="channel" label="Channel"><select name="channel" required><option>EMAIL</option><option>SMS</option><option>IN_APP</option></select></Field><Field name="status" label="Preference"><select name="status" required><option>OPTED_IN</option><option>OPTED_OUT</option></select></Field></ConfirmAction></Panel>
  </PortalShell>;
}
