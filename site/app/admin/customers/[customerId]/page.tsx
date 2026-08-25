import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ConfirmAction, DataTable, Field, MetricGrid, Panel, PortalShell, Status } from "@/components/Portal";
import { addBillingNoteAction, addCustomerNoteAction, subscriptionBillingOperationAction, updateBillingProfileAction } from "@/app/portal-actions";
import { adminPortalSession, customerBillingOverview, portalReadRepository } from "../../../portal-server";
import { ProviderSubscriptionControls } from "@/components/BillingProviderControls";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "CUSTOMER_READ");
  const [customer, billing] = await Promise.all([
    (await portalReadRepository()).getAdminCustomer(customerId),
    customerBillingOverview(customerId),
  ]);
  if (!customer) notFound();
  const subscriptionId = customer.subscription ? String(customer.subscription.id) : null;
  const billingProfile = billing.profile;
  return <PortalShell kind="Admin" title={customer.customer.businessName} subtitle={`${customer.customer.externalReference} · ${customer.customer.contactName}`} user={principal.displayName}>
    <MetricGrid items={[["Customer lifecycle", customer.customer.status], ["Subscription", customer.subscription?.status ?? "Not started"], ["Payment", billing.paymentState], ["Entitlements", billing.entitlementState]]} />
    <div className="portal-grid">
      <Panel title="Overview"><dl className="portal-details"><div><dt>Email</dt><dd>{customer.customer.email}</dd></div><div><dt>Phone</dt><dd>{customer.customer.phone ?? "—"}</dd></div><div><dt>Industry</dt><dd>{customer.customer.industry ?? "—"}</dd></div><div><dt>Website</dt><dd>{customer.customer.websiteUrl ?? "—"}</dd></div></dl></Panel>
      <Panel title="Billing overview"><dl className="portal-details"><div><dt>Plan</dt><dd>{customer.customer.planName ?? "—"}</dd></div><div><dt>Public price</dt><dd>{money(billing.pricing?.publicPriceMinor, billing.pricing?.currency)}</dd></div><div><dt>Negotiated price</dt><dd>{money(billing.pricing?.negotiatedPriceMinor, billing.pricing?.currency)}</dd></div><div><dt>Discount</dt><dd>{money(billing.pricing?.discountTotalMinor, billing.pricing?.currency)}</dd></div><div><dt>Effective price</dt><dd>{money(billing.pricing?.effectivePriceMinor, billing.pricing?.currency)}</dd></div><div><dt>Current period</dt><dd>{period(billing.subscription?.currentPeriodStart, billing.subscription?.currentPeriodEnd)}</dd></div><div><dt>Renewal / cancellation</dt><dd>{date(billing.subscription?.cancelAt ?? billing.subscription?.currentPeriodEnd)}</dd></div><div><dt>Grace ends</dt><dd>{date(billing.subscription?.gracePeriodEndsAt)}</dd></div><div><dt>Service extended</dt><dd>{date(billing.subscription?.serviceExtendedUntil)}</dd></div></dl></Panel>
    </div>
    {subscriptionId ? <Panel title="Subscription lifecycle controls"><p>Current state: <Status value={customer.subscription?.status} /></p>{principal.permissions.has("SUBSCRIPTION_WRITE") ? <div className="portal-grid">
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="MARK_PAST_DUE" label="Mark past due"><Field name="gracePeriodEndsAt" label="Grace period ends" type="datetime-local" /></Operation>
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="SUSPEND" label="Suspend service" />
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="RESUME" label="Resume / revoke scheduled cancellation" />
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="SCHEDULE_CANCELLATION" label="Cancel at period end" />
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="CANCEL_IMMEDIATELY" label="Cancel immediately" />
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="FINALIZE_CANCELLATION" label="Finalize due cancellation" />
      <Operation customerId={customerId} subscriptionId={subscriptionId} operation="EXTEND_SERVICE" label="Temporarily extend service"><Field name="serviceExtendedUntil" label="Service available until" type="datetime-local" /><Field name="reason" label="Reason" /></Operation>
    </div> : <p className="portal-empty">Your role has read-only subscription access.</p>}{principal.permissions.has("BILLING_WRITE") ? <ProviderSubscriptionControls subscriptionId={subscriptionId} /> : null}</Panel> : null}
    <Panel title="Billing contact"><dl className="portal-details"><div><dt>Name</dt><dd>{billingProfile?.contactName ?? "—"}</dd></div><div><dt>Email</dt><dd>{billingProfile?.contactEmail.value ?? "—"}</dd></div><div><dt>Phone</dt><dd>{billingProfile?.contactPhone ?? "—"}</dd></div></dl>{principal.permissions.has("BILLING_WRITE") ? <ConfirmAction action={updateBillingProfileAction} label="Update billing contact"><input type="hidden" name="customerId" value={customerId} /><Field name="contactName" label="Contact name" /><Field name="contactEmail" label="Contact email" type="email" /><Field name="contactPhone" label="Contact phone" required={false} /></ConfirmAction> : null}</Panel>
    <Panel title="Invoices & reminders"><DataTable rows={customer.invoices} columns={[["invoiceNumber", "Invoice"], ["status", "Status"], ["amountDueMinor", "Amount due"], ["dueAt", "Due"], ["paidAt", "Paid"]]} /><DataTable rows={customer.reminders} columns={[["invoiceNumber", "Invoice"], ["stage", "Stage"], ["status", "Status"], ["scheduledFor", "Scheduled"]]} /></Panel>
    <Panel title="Billing notes"><DataTable rows={billing.notes as unknown as Array<Record<string, unknown>>} columns={[["createdAt", "Created"], ["body", "Note"], ["subscriptionId", "Subscription"], ["invoiceId", "Invoice"]]} />{principal.permissions.has("BILLING_WRITE") ? <ConfirmAction action={addBillingNoteAction} label="Add billing note"><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="subscriptionId" value={subscriptionId ?? ""} /><Field name="body" label="Billing note"><textarea name="body" rows={4} maxLength={4000} required /></Field></ConfirmAction> : null}</Panel>
    <Panel title="Onboarding tasks"><DataTable rows={customer.onboarding?.tasks ?? []} columns={[["title", "Task"], ["ownerType", "Owner"], ["status", "Status"], ["dueAt", "Due"]]} /></Panel>
    <Panel title="Internal notes"><DataTable rows={customer.notes} columns={[["createdAt", "Created"], ["authorType", "Author"], ["body", "Note"]]} />{principal.permissions.has("CUSTOMER_WRITE") ? <ConfirmAction action={addCustomerNoteAction} label="Add internal note"><input type="hidden" name="customerId" value={customerId} /><Field name="body" label="Note"><textarea name="body" rows={4} maxLength={4000} required /></Field></ConfirmAction> : null}</Panel>
    <Panel title="Integrations & agents"><DataTable rows={[...customer.integrations, ...customer.agentLinks, ...customer.agentJobs]} columns={[["integrationCode", "Integration"], ["agentPlatform", "Platform"], ["operation", "Operation"], ["status", "Status"], ["updatedAt", "Updated"]]} /></Panel>
    <Panel title="Pricing & discounts"><DataTable rows={[...customer.priceOverrides, ...customer.discounts]} columns={[["planName", "Plan"], ["discountName", "Discount"], ["amountMinor", "Amount"], ["status", "Status"], ["effectiveFrom", "Effective"]]} /></Panel>
    <Panel title="Audit history"><DataTable rows={customer.auditEvents} columns={[["createdAt", "When"], ["actorType", "Actor"], ["action", "Action"], ["entityType", "Entity"]]} /></Panel>
  </PortalShell>;
}

function Operation({ customerId, subscriptionId, operation, label, children }: { customerId: string; subscriptionId: string; operation: string; label: string; children?: ReactNode }) {
  return <ConfirmAction action={subscriptionBillingOperationAction} label={label}><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="subscriptionId" value={subscriptionId} /><input type="hidden" name="operation" value={operation} />{children}</ConfirmAction>;
}

function money(amount: number | null | undefined, currency: string | undefined) { return amount == null ? "—" : new Intl.NumberFormat("en-AU", { style: "currency", currency: currency ?? "AUD" }).format(amount / 100); }
function date(value: Date | null | undefined) { return value ? value.toLocaleString("en-AU") : "—"; }
function period(start: Date | null | undefined, end: Date | null | undefined) { return start && end ? `${start.toLocaleDateString("en-AU")} – ${end.toLocaleDateString("en-AU")}` : "—"; }
