import assert from "node:assert/strict";
import test from "node:test";
import {
  CommercialNotificationOrchestrationService, DispatchNotificationService,
  MarkInAppNotificationReadService, QueueNotificationService,
} from "../modules/notification/application/notification-services.ts";
import type { CommercialNotificationSource } from "../modules/notification/application/ports.ts";
import { NotificationDeliveryAttempt } from "../modules/notification/domain/notification.ts";
import { ChannelNotificationProvider } from "../modules/notification/infrastructure/channel-notification-provider.ts";
import { D1CommercialNotificationSource } from "../modules/notification/infrastructure/d1-commercial-notification-source.ts";
import { D1NotificationRepository } from "../modules/notification/infrastructure/d1-notification-repository.ts";
import { OperationalQueueReconciliationService, OperationalQueueService } from "../modules/operations/application/operational-queue-services.ts";
import type { ExpectedOperationalWork } from "../modules/operations/application/ports.ts";
import { D1OperationalQueueRepository } from "../modules/operations/infrastructure/d1-operational-queue-repository.ts";
import { D1OperationalProjectionSource } from "../modules/operations/infrastructure/d1-operational-projection-source.ts";
import { EntityId } from "../modules/shared/domain/value-objects.ts";
import { NOOP_AUDIT } from "./support/audit.ts";
import { repositoryDatabase } from "./support/sqlite-d1.ts";

const CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";
const ADMIN_ID = "00000000-0000-4000-8000-000000000002";
const START = new Date("2026-08-24T12:00:00.000Z");

function setup() {
  const context = repositoryDatabase();
  context.client.database.exec(`insert into customers (id,external_reference,business_name,contact_name,email,status,creation_source,created_at,updated_at) values ('${CUSTOMER_ID}','customer-1','Example Plumbing','Casey','casey@example.invalid','ACTIVE','ADMIN',1,1)`);
  context.client.database.exec(`insert into admin_users (id,identity_provider,external_subject,email,display_name,status,bootstrap,created_at,updated_at) values ('${ADMIN_ID}','test','admin-1','admin@example.invalid','Admin','ACTIVE',0,1,1)`);
  let sequence = 500;
  let now = START;
  return {
    ...context,
    ids: { next: () => `91000000-0000-4000-8000-${(++sequence).toString().padStart(12, "0")}` },
    clock: { now: () => now },
    advance: (milliseconds: number) => { now = new Date(now.getTime() + milliseconds); },
  };
}

test("queue reconciliation creates, refreshes, and resolves projections without changing source state", async () => {
  const context = setup();
  let expected: ExpectedOperationalWork[] = [{
    queueType: "INTERNAL_ACTION", sourceType: "CUSTOMER_REGISTRATION", sourceId: CUSTOMER_ID,
    customerId: CUSTOMER_ID, priority: 20, title: "Review new customer registration",
    availableAt: START, dueAt: START,
  }];
  const repository = new D1OperationalQueueRepository(context.database);
  const reconcile = new OperationalQueueReconciliationService(repository, { listExpected: async () => expected }, context.ids, context.clock, NOOP_AUDIT);
  assert.deepEqual(await reconcile.execute(), { expected: 1, created: 1, refreshed: 0, resolved: 0, resolutionDeferred: false });
  const item = (await repository.listActive(10))[0]!;
  await new OperationalQueueService(repository, context.clock, NOOP_AUDIT).claim(item.props.id.value, ADMIN_ID);
  expected = [{ ...expected[0]!, priority: 5, title: "Urgent registration review" }];
  assert.deepEqual(await reconcile.execute(), { expected: 1, created: 0, refreshed: 1, resolved: 0, resolutionDeferred: false });
  assert.equal((await repository.findById(item.props.id.value))?.props.assignedToAdminUserId?.value, ADMIN_ID);
  expected = [];
  assert.deepEqual(await reconcile.execute(), { expected: 0, created: 0, refreshed: 0, resolved: 1, resolutionDeferred: false });
  assert.equal(context.client.database.prepare("select status from customers where id=?").get(CUSTOMER_ID)?.status, "ACTIVE");
  context.client.close();
});

test("expired delivery leases are reclaimed and retain immutable attempt history", async () => {
  const context = setup();
  const repository = new D1NotificationRepository(context.database);
  const delivery = await new QueueNotificationService(repository, context.ids, context.clock, NOOP_AUDIT).request({
    code: "agent_ready", channel: "IN_APP", customerId: CUSTOMER_ID, recipientType: "CUSTOMER",
    recipientId: CUSTOMER_ID, variables: { name: "Casey", platform: "zuno_agent" }, idempotencyKey: "agent-ready-test",
  });
  assert.ok(delivery);
  const started = delivery.start(context.clock.now(), new Date(context.clock.now().getTime() + 60_000));
  const abandoned = new NotificationDeliveryAttempt({
    id: new EntityId(context.ids.next()), deliveryId: delivery.props.id, attemptNumber: 1,
    provider: "test", status: "PROCESSING", providerReference: null, errorCategory: null,
    startedAt: context.clock.now(), completedAt: null, createdAt: context.clock.now(),
  });
  await repository.startAttempt(started, delivery.props.version, abandoned);
  context.advance(60_001);
  const sent = await new DispatchNotificationService(repository, new ChannelNotificationProvider(), context.clock, NOOP_AUDIT, context.ids).execute();
  assert.equal(sent?.props.status, "SENT");
  assert.equal(sent?.props.attemptCount, 2);
  const attempts = context.client.database.prepare("select attempt_number,status,error_category from notification_delivery_attempts order by attempt_number").all().map((row) => ({ ...row }));
  assert.deepEqual(attempts, [
    { attempt_number: 1, status: "FAILED", error_category: "LEASE_EXPIRED" },
    { attempt_number: 2, status: "SENT", error_category: null },
  ]);
  const read = await new MarkInAppNotificationReadService(repository, context.clock, NOOP_AUDIT).execute(sent!.props.id.value, CUSTOMER_ID);
  assert.ok(read.props.readAt);
  await assert.rejects(() => new MarkInAppNotificationReadService(repository, context.clock, NOOP_AUDIT).execute(sent!.props.id.value, ADMIN_ID), /does not belong/);
  context.client.close();
});

test("commercial notification orchestration honours consent and remains idempotent", async () => {
  const context = setup();
  const repository = new D1NotificationRepository(context.database);
  await repository.setPreference({ id: context.ids.next(), customerId: CUSTOMER_ID, code: "welcome", channel: "EMAIL", status: "OPTED_OUT", updatedBy: CUSTOMER_ID, at: START });
  const source: CommercialNotificationSource = { listRequired: async () => [
    { code: "welcome" as const, channel: "EMAIL" as const, customerId: CUSTOMER_ID, recipientId: "casey@example.invalid", variables: { name: "Casey", business: "Example Plumbing" } as Record<string, string>, idempotencyKey: "welcome-test" },
    { code: "agent_ready" as const, channel: "IN_APP" as const, customerId: CUSTOMER_ID, recipientId: CUSTOMER_ID, variables: { name: "Casey", platform: "zuno_agent" } as Record<string, string>, idempotencyKey: "agent-ready-orchestration" },
  ] };
  const service = new CommercialNotificationOrchestrationService(source, new QueueNotificationService(repository, context.ids, context.clock, NOOP_AUDIT), context.clock);
  assert.deepEqual(await service.reconcile(), { considered: 2, queued: 1, optedOut: 1 });
  assert.deepEqual(await service.reconcile(), { considered: 2, queued: 1, optedOut: 1 });
  assert.equal(context.client.database.prepare("select count(*) count from notification_deliveries").get()?.count, 1);
  context.client.close();
});

test("D1 projection sources cover registration, onboarding, customer action, and integration attention", async () => {
  const context = setup();
  context.client.database.exec(`update customers set status='PROSPECT' where id='${CUSTOMER_ID}'`);
  context.client.database.exec(`insert into onboarding_cases (id,customer_id,status,started_at,version,created_at,updated_at) values ('92000000-0000-4000-8000-000000000001','${CUSTOMER_ID}','IN_PROGRESS',100,1,100,100)`);
  context.client.database.exec("insert into onboarding_tasks (id,onboarding_case_id,code,title,owner_type,status,required,sort_order,version,created_at,updated_at) values ('92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','business_profile','Complete business profile','CUSTOMER','TODO',1,0,1,100,100)");
  context.client.database.exec(`insert into customer_integrations (id,customer_id,integration_code,category,status,error_code,metadata_json,version,created_at,updated_at) values ('92000000-0000-4000-8000-000000000003','${CUSTOMER_ID}','crm','CRM','ERROR','AUTH_REVOKED','{}',1,100,100)`);
  const work = await new D1OperationalProjectionSource(context.database).listExpected(START, 100);
  assert.deepEqual(new Set(work.map((item) => item.sourceType)), new Set(["CUSTOMER_REGISTRATION", "ONBOARDING_CASE", "ONBOARDING_TASK", "CUSTOMER_INTEGRATION"]));
  const notifications = await new D1CommercialNotificationSource(context.database).listRequired(START, 100);
  assert.deepEqual(new Set(notifications.map((item) => item.code)), new Set(["welcome", "customer_action_required", "onboarding_reminder", "integration_action_required"]));
  context.client.close();
});

test("subscription notifications follow audited lifecycle facts instead of subscription version guesses", async () => {
  const context = setup();
  context.client.database.exec("insert into plans (id,code,name,active,featured,custom,display_order,created_at,updated_at) values ('93000000-0000-4000-8000-000000000001','growth','Growth',1,0,0,0,1,1)");
  context.client.database.exec(`insert into subscriptions (id,customer_id,plan_id,status,billing_interval,currency,started_at,version,created_at,updated_at) values ('93000000-0000-4000-8000-000000000002','${CUSTOMER_ID}','93000000-0000-4000-8000-000000000001','ACTIVE','MONTHLY','AUD',1,4,1,4)`);
  context.client.database.exec("insert into audit_events (id,actor_type,actor_id,action,entity_type,entity_id,after_json,request_id,created_at) values ('93000000-0000-4000-8000-000000000003','SYSTEM','worker','SUBSCRIPTION_CREATED','SUBSCRIPTION','93000000-0000-4000-8000-000000000002','{\"subscription\":{\"status\":\"ACTIVE\"}}','request-1',2)");
  context.client.database.exec("insert into audit_events (id,actor_type,actor_id,action,entity_type,entity_id,before_json,after_json,request_id,created_at) values ('93000000-0000-4000-8000-000000000004','SYSTEM','worker','SUBSCRIPTION_RESUMED','SUBSCRIPTION','93000000-0000-4000-8000-000000000002','{\"status\":\"SUSPENDED\"}','{\"status\":\"ACTIVE\"}','request-2',3)");
  context.client.database.exec("insert into audit_events (id,actor_type,actor_id,action,entity_type,entity_id,before_json,after_json,request_id,created_at) values ('93000000-0000-4000-8000-000000000005','SYSTEM','worker','SUBSCRIPTION_SERVICE_EXTENDED','SUBSCRIPTION','93000000-0000-4000-8000-000000000002','{\"status\":\"ACTIVE\"}','{\"status\":\"ACTIVE\"}','request-3',4)");
  const notifications = await new D1CommercialNotificationSource(context.database).listRequired(START, 100);
  assert.deepEqual(notifications.filter((item) => item.code.startsWith("subscription_")).map((item) => item.code), ["subscription_activated", "subscription_resumed"]);
  context.client.close();
});
