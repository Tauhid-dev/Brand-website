import { notFound } from "next/navigation";
import { ConfirmAction, DataTable, Field, MetricGrid, Panel, PortalShell, Status } from "@/components/Portal";
import { addCustomerNoteAction, changeSubscriptionAction } from "@/app/portal-actions";
import { adminPortalSession, portalReadRepository } from "../../../portal-server";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "CUSTOMER_READ");
  const customer = await (await portalReadRepository()).getAdminCustomer(customerId);
  if (!customer) notFound();
  return <PortalShell kind="Admin" title={customer.customer.businessName} subtitle={`${customer.customer.externalReference} · ${customer.customer.contactName}`} user={principal.displayName}>
    <MetricGrid items={[["Customer lifecycle", customer.customer.status], ["Onboarding", customer.onboarding?.status ?? "Not started"], ["Subscription", customer.subscription?.status ?? "Not started"], ["Plan", customer.customer.planName ?? "Not selected"]]} />
    <div className="portal-grid"><Panel title="Overview"><dl className="portal-details"><div><dt>Email</dt><dd>{customer.customer.email}</dd></div><div><dt>Phone</dt><dd>{customer.customer.phone ?? "—"}</dd></div><div><dt>Industry</dt><dd>{customer.customer.industry ?? "—"}</dd></div><div><dt>Website</dt><dd>{customer.customer.websiteUrl ?? "—"}</dd></div></dl></Panel><Panel title="Commercial controls">{customer.subscription ? <><p>Current state: <Status value={customer.subscription.status} /></p>{principal.permissions.has("SUBSCRIPTION_WRITE") ? <ConfirmAction action={changeSubscriptionAction} label="Change subscription"><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="subscriptionId" value={String(customer.subscription.id)} /><Field name="target" label="New status"><select name="target" required><option value="ACTIVE">Active / resume</option><option value="PAST_DUE">Past due</option><option value="SUSPENDED">Suspend</option><option value="CANCELLED">Cancel</option></select></Field></ConfirmAction> : <p className="portal-empty">Your role has read-only subscription access.</p>}</> : <p className="portal-empty">No subscription is attached.</p>}</Panel></div>
    <Panel title="Onboarding tasks"><DataTable rows={customer.onboarding?.tasks ?? []} columns={[["title", "Task"], ["ownerType", "Owner"], ["status", "Status"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Internal notes"><DataTable rows={customer.notes} columns={[["createdAt", "Created"], ["authorType", "Author"], ["body", "Note"]]} />{principal.permissions.has("CUSTOMER_WRITE") ? <ConfirmAction action={addCustomerNoteAction} label="Add internal note"><input type="hidden" name="customerId" value={customerId} /><Field name="body" label="Note"><textarea name="body" rows={4} maxLength={4000} required /></Field></ConfirmAction> : null}</Panel>
    <Panel title="Integrations & agents"><DataTable rows={[...customer.integrations, ...customer.agentLinks, ...customer.agentJobs]} columns={[["integrationCode", "Integration"], ["agentPlatform", "Platform"], ["operation", "Operation"], ["status", "Status"], ["updatedAt", "Updated"]]} /></Panel>
    <Panel title="Pricing & discounts"><DataTable rows={[...customer.priceOverrides, ...customer.discounts]} columns={[["planName", "Plan"], ["discountName", "Discount"], ["amountMinor", "Amount"], ["status", "Status"], ["effectiveFrom", "Effective"]]} /></Panel>
    <Panel title="Billing history"><DataTable rows={customer.invoices} columns={[["invoiceNumber", "Invoice"], ["status", "Status"], ["totalMinor", "Total"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Audit history"><DataTable rows={customer.auditEvents} columns={[["createdAt", "When"], ["actorType", "Actor"], ["action", "Action"], ["entityType", "Entity"]]} /></Panel>
  </PortalShell>;
}
