import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { AuditService } from "@/modules/audit/application/audit-service";
import { D1AuditEventRepository } from "@/modules/audit/infrastructure/d1-audit-event-repository";
import { CustomerAuthenticationService, AdminAuthenticationService, AdminAuthorizationGuard } from "@/modules/identity/application/access-control-services";
import type { AdminPrincipal, CustomerPrincipal, PermissionCode } from "@/modules/identity/domain/access-control";
import { D1AdminAccessRepository } from "@/modules/identity/infrastructure/d1-admin-access-repository";
import { D1CustomerIdentityRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { D1PortalReadRepository } from "@/modules/portal/infrastructure/d1-portal-read-repository";
import { CryptoUuidGenerator, SystemClock } from "@/modules/shared/application/ports";
import { RequestContextFactory, type RequestActor } from "@/modules/shared/application/request-context";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "@/modules/shared/domain/errors";
import { requireAdminSession, requireCustomerSession } from "./server-authorization";

export async function portalReadRepository() {
  return new D1PortalReadRepository(await getDb());
}

function auditFor(db: Awaited<ReturnType<typeof getDb>>, actor: RequestActor = { type: "ANONYMOUS" }) {
  const ids = new CryptoUuidGenerator();
  const clock = new SystemClock();
  const context = new RequestContextFactory(ids, clock).create({ actor });
  return new AuditService(new D1AuditEventRepository(db), ids, clock, context);
}

export async function customerPortalSession(returnTo = "/account"): Promise<CustomerPrincipal> {
  try {
    const db = await getDb();
    return await requireCustomerSession(returnTo, new CustomerAuthenticationService(new D1CustomerIdentityRepository(db)));
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof AuthorizationDeniedError) redirect("/access-denied?area=account");
    throw error;
  }
}

export async function adminPortalSession(returnTo: string, permission: PermissionCode): Promise<AdminPrincipal> {
  try {
    const db = await getDb();
    return await requireAdminSession(
      returnTo,
      permission,
      new AdminAuthenticationService(new D1AdminAccessRepository(db), new SystemClock(), auditFor(db)),
      new AdminAuthorizationGuard(),
    );
  } catch (error) {
    if (error instanceof AuthenticationRequiredError || error instanceof AuthorizationDeniedError) redirect("/access-denied?area=admin");
    throw error;
  }
}

export async function actionRuntime(actor: RequestActor) {
  const db = await getDb();
  const ids = new CryptoUuidGenerator();
  const clock = new SystemClock();
  return { db, ids, clock, audit: auditFor(db, actor) };
}
