import type { PermissionCode } from "../../../../modules/identity/domain/access-control.ts";

export type AdminApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

export function adminRoutePermission(method: AdminApiMethod, segments: readonly string[]): PermissionCode | null {
  if (method === "GET") {
    if (matches(segments, "customers") || matches(segments, "customers", "*") ) return "CUSTOMER_READ";
    if (matches(segments, "customers", "*", "pricing")) return "PRICE_READ";
    if (matches(segments, "customers", "*", "billing") || matches(segments, "invoices")) return "BILLING_READ";
    if (matches(segments, "plans") || matches(segments, "offerings")) return "CATALOG_READ";
    if (matches(segments, "prices")) return "PRICE_READ";
    if (matches(segments, "discounts") || matches(segments, "promotion-codes")) return "DISCOUNT_READ";
    if (matches(segments, "subscriptions") || matches(segments, "subscriptions", "*")) return "SUBSCRIPTION_READ";
    if (matches(segments, "notifications")) return "OPERATIONS_READ";
    if (matches(segments, "audit-events")) return "AUDIT_READ";
  }
  if (method === "POST") {
    if (matches(segments, "customers")) return "CUSTOMER_WRITE";
    if (matches(segments, "customers", "*", "pricing", "preview")) return "PRICE_READ";
    if (matches(segments, "customers", "*", "price-overrides")) return "PRICE_WRITE";
    if (matches(segments, "customers", "*", "discounts")) return "DISCOUNT_WRITE";
    if (matches(segments, "customers", "*", "billing-profile") || matches(segments, "customers", "*", "billing-notes")) return "BILLING_WRITE";
    if (matches(segments, "plans") || matches(segments, "offerings")) return "CATALOG_WRITE";
    if (matches(segments, "prices")) return "PRICE_WRITE";
    if (matches(segments, "discounts") || matches(segments, "promotion-codes")) return "DISCOUNT_WRITE";
    if (matches(segments, "subscriptions") || matches(segments, "subscriptions", "*", "operations")) return "SUBSCRIPTION_WRITE";
    if (matches(segments, "service-credentials") || matches(segments, "service-credentials", "*", "rotate")) return "ADMIN_USER_MANAGE";
  }
  if (method === "PATCH" && matches(segments, "subscriptions", "*")) return "SUBSCRIPTION_WRITE";
  if (method === "DELETE" && matches(segments, "service-credentials", "*")) return "ADMIN_USER_MANAGE";
  return null;
}

function matches(segments: readonly string[], ...pattern: string[]) {
  return segments.length === pattern.length && pattern.every((value, index) => value === "*" ? Boolean(segments[index]) : segments[index] === value);
}
