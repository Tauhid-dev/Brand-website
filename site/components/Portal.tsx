import Link from "next/link";
import { isValidElement, type ReactNode } from "react";
import { resolveIdentityRuntime, runtimeSignOutPath, standaloneLogoutToken } from "@/app/identity-runtime";

export const adminNav = [
  ["/admin", "Dashboard"], ["/admin/customers", "Customers"], ["/admin/catalogue", "Catalogue"],
  ["/admin/pricing", "Pricing"], ["/admin/discounts", "Discounts"], ["/admin/subscriptions", "Subscriptions"],
  ["/admin/billing", "Billing"], ["/admin/operations", "Operations"], ["/admin/agents", "Agent integration"], ["/admin/audit", "Audit log"], ["/admin/settings", "Settings"],
] as const;

export async function PortalShell({ kind, title, subtitle, user, children }: { kind: "Customer" | "Admin"; title: string; subtitle: string; user: string; children: ReactNode }) {
  const oidc = resolveIdentityRuntime() === "oidc";
  const csrfToken = oidc ? await standaloneLogoutToken() : null;
  return <div className="portal"><aside className="portal-sidebar"><Link className="portal-brand" href={kind === "Admin" ? "/admin" : "/account"}>Zuno Pixel <small>{kind} portal</small></Link><nav aria-label={`${kind} portal`}>{kind === "Admin" ? adminNav.map(([href, label]) => <Link key={href} href={href}>{label}</Link>) : <><Link href="/account">Account overview</Link><a href="#onboarding">Onboarding</a><a href="#billing">Billing</a><a href="#notifications">Notifications</a></>}</nav><div className="portal-user"><span>{user}</span>{oidc ? <form action={runtimeSignOutPath("/")} method="post"><input name="csrfToken" type="hidden" value={csrfToken ?? ""} /><button className="link-button" type="submit">Sign out</button></form> : <a href={runtimeSignOutPath("/")}>Sign out</a>}</div></aside><section className="portal-content"><header className="portal-heading"><div><span className="eyebrow">{kind} workspace</span><h1>{title}</h1><p>{subtitle}</p></div></header>{children}</section></div>;
}

export function MetricGrid({ items }: { items: Array<[string, string | number]> }) {
  return <div className="portal-metrics">{items.map(([label, value]) => <article key={label}><strong>{value}</strong><span>{label}</span></article>)}</div>;
}

export function Panel({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section className="portal-panel" id={id}><h2>{title}</h2>{children}</section>;
}

export function Status({ value }: { value: unknown }) {
  const text = String(value ?? "Not set");
  return <span className={`portal-status status-${text.toLowerCase().replaceAll("_", "-")}`}>{text.replaceAll("_", " ")}</span>;
}

export function DataTable({ rows, columns, empty = "No records yet." }: { rows: Array<Record<string, unknown>>; columns: Array<[string, string]>; empty?: string }) {
  if (!rows.length) return <p className="portal-empty">{empty}</p>;
  return <div className="portal-table-wrap"><table className="portal-table"><thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map(([key]) => <td key={key}>{renderValue(row[key])}</td>)}</tr>)}</tbody></table></div>;
}

export function ConfirmAction({ action, label, children }: { action: (data: FormData) => void | Promise<void>; label: string; children: ReactNode }) {
  return <details className="portal-action"><summary>{label}</summary><form action={action}>{children}<label className="confirm-check"><input name="confirmed" value="yes" type="checkbox" required /> I understand and confirm this action</label><button className="button small" type="submit">Confirm {label.toLowerCase()}</button></form></details>;
}

export function Field({ name, label, type = "text", required = true, children }: { name: string; label: string; type?: string; required?: boolean; children?: ReactNode }) {
  return <label className="portal-field"><span>{label}</span>{children ?? <input name={name} type={type} required={required} />}</label>;
}

function renderValue(value: unknown): ReactNode {
  if (value == null || value === "") return "—";
  if (isValidElement(value)) return value;
  if (value instanceof Date) return value.toLocaleString("en-AU");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return <code>{JSON.stringify(value)}</code>;
  if (typeof value === "string" && /^[A-Z][A-Z_]+$/.test(value)) return <Status value={value} />;
  return String(value);
}
