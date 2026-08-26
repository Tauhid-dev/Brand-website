import { requireRuntimeIdentity } from "./identity-runtime.ts";
import type {
  AdminAuthenticationService,
  AdminAuthorizationGuard,
  CustomerAuthenticationService,
} from "../modules/identity/application/access-control-services.ts";
import {
  type AdminPrincipal,
  type CustomerPrincipal,
  type PermissionCode,
} from "../modules/identity/domain/access-control.ts";

export async function requireCustomerSession(
  returnTo: string,
  authentication: CustomerAuthenticationService,
): Promise<CustomerPrincipal> {
  return authentication.execute(await requireRuntimeIdentity(returnTo));
}

export async function requireAdminSession(
  returnTo: string,
  permission: PermissionCode,
  authentication: AdminAuthenticationService,
  authorization: AdminAuthorizationGuard,
): Promise<AdminPrincipal> {
  const principal = await authentication.execute(await requireRuntimeIdentity(returnTo));
  authorization.requirePermission(principal, permission);
  return principal;
}
