import { requireChatGPTUser } from "./chatgpt-auth.ts";
import type {
  AdminAuthenticationService,
  AdminAuthorizationGuard,
  CustomerAuthenticationService,
} from "../modules/identity/application/access-control-services.ts";
import {
  CHATGPT_IDENTITY_PROVIDER,
  createExternalIdentity,
  type AdminPrincipal,
  type CustomerPrincipal,
  type PermissionCode,
} from "../modules/identity/domain/access-control.ts";

export async function requireCustomerSession(
  returnTo: string,
  authentication: CustomerAuthenticationService,
): Promise<CustomerPrincipal> {
  const user = await requireChatGPTUser(returnTo);
  return authentication.execute(createExternalIdentity({
    provider: CHATGPT_IDENTITY_PROVIDER,
    externalSubject: user.externalSubject,
    email: user.email,
    displayName: user.displayName,
  }));
}

export async function requireAdminSession(
  returnTo: string,
  permission: PermissionCode,
  authentication: AdminAuthenticationService,
  authorization: AdminAuthorizationGuard,
): Promise<AdminPrincipal> {
  const user = await requireChatGPTUser(returnTo);
  const principal = await authentication.execute(createExternalIdentity({
    provider: CHATGPT_IDENTITY_PROVIDER,
    externalSubject: user.externalSubject,
    email: user.email,
    displayName: user.displayName,
  }));
  authorization.requirePermission(principal, permission);
  return principal;
}
