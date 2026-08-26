import { getDb } from "../db/index.ts";
import { AuditService } from "../modules/audit/application/audit-service.ts";
import { D1AuditEventRepository } from "../modules/audit/infrastructure/d1-audit-event-repository.ts";
import { BootstrapFirstAdminService } from "../modules/identity/application/access-control-services.ts";
import { createExternalIdentity } from "../modules/identity/domain/access-control.ts";
import { D1AdminAccessRepository } from "../modules/identity/infrastructure/d1-admin-access-repository.ts";
import { CryptoUuidGenerator, SystemClock } from "../modules/shared/application/ports.ts";
import { RequestContextFactory } from "../modules/shared/application/request-context.ts";

if (!process.argv.includes("--confirm-first-admin")) throw new Error("Pass --confirm-first-admin to acknowledge this one-time operation.");
const provider = required("BOOTSTRAP_IDENTITY_PROVIDER");
const externalSubject = required("BOOTSTRAP_EXTERNAL_SUBJECT");
const email = required("BOOTSTRAP_EMAIL");
const displayName = required("BOOTSTRAP_DISPLAY_NAME");
const db = await getDb();
const ids = new CryptoUuidGenerator();
const clock = new SystemClock();
const audit = new AuditService(new D1AuditEventRepository(db), ids, clock, new RequestContextFactory(ids, clock).create({ actor: { type: "SYSTEM", id: "first-admin-bootstrap" } }));
const admin = await new BootstrapFirstAdminService(new D1AdminAccessRepository(db), ids, clock, audit).execute(createExternalIdentity({ provider, externalSubject, email, displayName }));
console.log(`Created first administrator ${admin.props.email.value} with SUPER_ADMIN. No credential material was generated or printed.`);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
