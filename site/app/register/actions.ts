"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getRuntimeIdentity } from "@/app/identity-runtime";
import { AuditService } from "@/modules/audit/application/audit-service";
import { RegisterCustomerService, CreateCustomerService } from "@/modules/customer/application/customer-services";
import { D1CustomerIdentityRepository, D1CustomerRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { CryptoUuidGenerator, SystemClock } from "@/modules/shared/application/ports";
import { RequestContextFactory } from "@/modules/shared/application/request-context";
import { DomainValidationError } from "@/modules/shared/domain/errors";
import { D1AuditEventRepository } from "@/modules/audit/infrastructure/d1-audit-event-repository";

export async function registerCustomerAction(data: FormData) {
  const identity = await getRuntimeIdentity();
  if (!identity) redirect("/auth/login?return_to=%2Fregister");
  const db = await getDb();
  const ids = new CryptoUuidGenerator();
  const clock = new SystemClock();
  const audit = new AuditService(new D1AuditEventRepository(db), ids, clock, new RequestContextFactory(ids, clock).create({ actor: { type: "ANONYMOUS" } }));
  const customers = new D1CustomerRepository(db);
  const identities = new D1CustomerIdentityRepository(db);
  await new RegisterCustomerService(new CreateCustomerService(customers, ids, clock, audit), identities, ids, clock, audit).execute({
    provider: identity.provider,
    externalSubject: identity.externalSubject,
    externalReference: required(data, "externalReference", 120),
    businessName: required(data, "businessName", 200),
    contactName: required(data, "contactName", 200),
    email: identity.email.value,
    phone: optional(data, "phone", 50),
    websiteUrl: optional(data, "websiteUrl", 500),
    industry: optional(data, "industry", 120),
    state: optional(data, "state", 80),
    postcode: optional(data, "postcode", 12),
  });
  redirect("/account");
}

function required(data: FormData, name: string, maximum: number) {
  const value = String(data.get(name) ?? "").trim();
  if (!value || value.length > maximum) throw new DomainValidationError("INVALID_REGISTRATION", `${name} is invalid.`);
  return value;
}
function optional(data: FormData, name: string, maximum: number) {
  const value = String(data.get(name) ?? "").trim();
  if (value.length > maximum) throw new DomainValidationError("INVALID_REGISTRATION", `${name} is invalid.`);
  return value || null;
}
