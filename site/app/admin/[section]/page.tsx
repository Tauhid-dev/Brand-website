import { notFound } from "next/navigation";
import { DataTable, Panel, PortalShell } from "@/components/Portal";
import type { PermissionCode } from "@/modules/identity/domain/access-control";
import { adminPortalSession, portalReadRepository } from "../../portal-server";

export const dynamic = "force-dynamic";

type Section = { title: string; subtitle: string; permission: PermissionCode; load: () => Promise<Array<{ title: string; rows: Array<Record<string, unknown>>; columns: Array<[string, string]> }>> };

function sections(read: Awaited<ReturnType<typeof portalReadRepository>>): Record<string, Section> {
  return {
    catalogue: { title: "Catalogue", subtitle: "Plans, offerings, entitlements and published price history.", permission: "CATALOG_READ", load: async () => { const data = await read.getCatalogue(); return [{ title: "Plans", rows: data.plans, columns: [["code", "Code"], ["name", "Plan"], ["status", "Status"], ["displayOrder", "Order"]] }, { title: "Offerings", rows: data.offerings, columns: [["code", "Code"], ["name", "Offering"], ["status", "Status"]] }, { title: "Plan features", rows: data.features, columns: [["planName", "Plan"], ["offeringName", "Offering"], ["enabled", "Enabled"], ["limitValue", "Limit"]] }, { title: "Published prices", rows: data.prices, columns: [["planName", "Plan"], ["billingInterval", "Interval"], ["amountMinor", "Amount"], ["currency", "Currency"], ["effectiveFrom", "Effective"]] }]; } },
    pricing: { title: "Pricing", subtitle: "Effective-dated plan prices, customer overrides and saved quote previews.", permission: "PRICE_READ", load: async () => { const data = await read.getPricing(); return [{ title: "Plan prices", rows: data.prices, columns: [["planName", "Plan"], ["billingInterval", "Interval"], ["amountMinor", "Amount"], ["effectiveFrom", "From"], ["effectiveTo", "To"]] }, { title: "Customer overrides", rows: data.overrides, columns: [["customerName", "Customer"], ["planName", "Plan"], ["amountMinor", "Amount"], ["effectiveFrom", "From"]] }, { title: "Saved previews", rows: data.quotes, columns: [["customerName", "Customer"], ["planName", "Plan"], ["billingInterval", "Interval"], ["createdAt", "Created"]] }]; } },
    discounts: { title: "Discounts & promotions", subtitle: "Reusable rules, promotion codes, assignments and redemption history.", permission: "DISCOUNT_READ", load: async () => { const data = await read.getDiscounts(); return [{ title: "Discount definitions", rows: data.discounts, columns: [["code", "Code"], ["name", "Discount"], ["kind", "Type"], ["status", "Status"]] }, { title: "Promotion codes", rows: data.promotions, columns: [["code", "Code"], ["discountName", "Discount"], ["status", "Status"], ["expiresAt", "Expires"]] }, { title: "Customer assignments", rows: data.assignments, columns: [["customerName", "Customer"], ["discountName", "Discount"], ["status", "Status"], ["effectiveFrom", "From"]] }, { title: "Redemptions", rows: data.redemptions, columns: [["customerId", "Customer ID"], ["amountMinor", "Amount"], ["redeemedAt", "Redeemed"]] }]; } },
    subscriptions: { title: "Subscriptions", subtitle: "Contract lifecycle and service access status.", permission: "SUBSCRIPTION_READ", load: async () => [{ title: "Subscription records", rows: await read.getSubscriptions(), columns: [["customerName", "Customer"], ["planName", "Plan"], ["billingInterval", "Interval"], ["status", "Status"], ["updatedAt", "Updated"]] }] },
    billing: { title: "Billing", subtitle: "Invoice history, payment attention and reminder operations.", permission: "BILLING_READ", load: async () => { const data = await read.getBilling(); return [{ title: "Invoices", rows: data.invoices, columns: [["invoiceNumber", "Invoice"], ["customerName", "Customer"], ["paymentState", "Payment"], ["amountDueMinor", "Amount due"], ["dueAt", "Due"]] }, { title: "Payment reminders", rows: data.reminders, columns: [["invoiceNumber", "Invoice"], ["customerName", "Customer"], ["stage", "Stage"], ["status", "Status"], ["scheduledFor", "Scheduled"]] }]; } },
    agents: { title: "Agent integration", subtitle: "Linked customer agents and provisioning jobs.", permission: "AGENT_LINK_READ", load: async () => { const data = await read.getAgents(); return [{ title: "Agent links", rows: data.links, columns: [["customerName", "Customer"], ["agentPlatform", "Platform"], ["externalAgentId", "External ID"], ["status", "Status"]] }, { title: "Provisioning jobs", rows: data.jobs, columns: [["customerName", "Customer"], ["platform", "Platform"], ["operation", "Operation"], ["status", "Status"], ["attemptCount", "Attempts"]] }]; } },
    audit: { title: "Audit log", subtitle: "Immutable history for commercially important actions.", permission: "AUDIT_READ", load: async () => [{ title: "Recent events", rows: await read.getAuditEvents(), columns: [["createdAt", "When"], ["actorType", "Actor type"], ["actorId", "Actor ID"], ["action", "Action"], ["entityType", "Entity"], ["entityId", "Entity ID"]] }] },
    settings: { title: "Settings", subtitle: "Administrator access and assigned roles.", permission: "ADMIN_USER_MANAGE", load: async () => [{ title: "Administrators", rows: await read.getAdminUsers(), columns: [["displayName", "Name"], ["email", "Email"], ["status", "Status"], ["roles", "Roles"], ["lastLoginAt", "Last login"]] }] },
  };
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: slug } = await params;
  const section = sections(await portalReadRepository())[slug];
  if (!section) notFound();
  const principal = await adminPortalSession(`/admin/${slug}`, section.permission);
  const panels = await section.load();
  return <PortalShell kind="Admin" title={section.title} subtitle={section.subtitle} user={principal.displayName}>{panels.map((panel) => <Panel key={panel.title} title={panel.title}><DataTable rows={panel.rows} columns={panel.columns} /></Panel>)}</PortalShell>;
}
