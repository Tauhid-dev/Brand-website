"use server";

import { revalidatePath } from "next/cache";
import { AddCustomerNoteService } from "@/modules/customer/application/customer-services";
import { D1CustomerRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { CommercialNotificationOrchestrationService, MarkInAppNotificationReadService, NotificationPreferenceService, QueueNotificationService } from "@/modules/notification/application/notification-services";
import { NOTIFICATION_CHANNELS, type NotificationChannel, type NotificationPreferenceStatus } from "@/modules/notification/domain/notification";
import { D1CommercialNotificationSource } from "@/modules/notification/infrastructure/d1-commercial-notification-source";
import { D1NotificationRepository } from "@/modules/notification/infrastructure/d1-notification-repository";
import { OperationalQueueReconciliationService, OperationalQueueService } from "@/modules/operations/application/operational-queue-services";
import { D1OperationalProjectionSource } from "@/modules/operations/infrastructure/d1-operational-projection-source";
import { D1OperationalQueueRepository } from "@/modules/operations/infrastructure/d1-operational-queue-repository";
import { AddBillingNoteService, UpdateCustomerBillingProfileService } from "@/modules/billing/application/billing-operations-services";
import { D1BillingRepository } from "@/modules/billing/infrastructure/d1-billing-repository";
import { D1PricingRepository } from "@/modules/pricing/infrastructure/d1-pricing-repository";
import { SubscriptionLifecycleService } from "@/modules/subscription/application/subscription-services";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { DomainValidationError } from "@/modules/shared/domain/errors";
import { actionRuntime, adminPortalSession, customerPortalSession } from "./portal-server";
import { systemHardeningServices } from "./system-hardening-runtime";

function requireConfirmation(data: FormData) {
  if (data.get("confirmed") !== "yes") throw new DomainValidationError("CONFIRMATION_REQUIRED", "Explicit confirmation is required.");
}

function required(data: FormData, name: string, max = 500) {
  const value = String(data.get(name) ?? "").trim();
  if (!value || value.length > max) throw new DomainValidationError("INVALID_FORM_VALUE", `${name} is invalid.`);
  return value;
}

function optional(data: FormData, name: string, max = 500) {
  const value = String(data.get(name) ?? "").trim();
  if (value.length > max) throw new DomainValidationError("INVALID_FORM_VALUE", `${name} is invalid.`);
  return value || null;
}

function requiredDate(data: FormData, name: string) {
  const value = new Date(required(data, name, 80));
  if (!Number.isFinite(value.getTime())) throw new DomainValidationError("INVALID_FORM_DATE", `${name} must be a valid date.`);
  return value;
}

export async function addCustomerNoteAction(data: FormData) {
  requireConfirmation(data);
  const customerId = required(data, "customerId", 80);
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "CUSTOMER_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await new AddCustomerNoteService(new D1CustomerRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).execute({ customerId, body: required(data, "body", 4_000), authorType: "ADMIN", authorId: principal.adminUserId });
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function subscriptionBillingOperationAction(data: FormData) {
  requireConfirmation(data);
  const customerId = required(data, "customerId", 80);
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "SUBSCRIPTION_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  const lifecycle = new SubscriptionLifecycleService(new D1SubscriptionRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit);
  const subscriptionId = required(data, "subscriptionId", 80);
  switch (required(data, "operation", 40)) {
    case "MARK_PAST_DUE": await lifecycle.markPastDue(subscriptionId, requiredDate(data, "gracePeriodEndsAt")); break;
    case "SUSPEND": await lifecycle.suspend(subscriptionId); break;
    case "RESUME": await lifecycle.resume(subscriptionId); break;
    case "SCHEDULE_CANCELLATION": await lifecycle.scheduleCancellation(subscriptionId); break;
    case "CANCEL_IMMEDIATELY": await lifecycle.cancel(subscriptionId); break;
    case "FINALIZE_CANCELLATION": await lifecycle.finalizeCancellation(subscriptionId); break;
    case "EXTEND_SERVICE": await lifecycle.extendService(subscriptionId, requiredDate(data, "serviceExtendedUntil"), required(data, "reason", 500)); break;
    default: throw new DomainValidationError("INVALID_SUBSCRIPTION_OPERATION", "Subscription operation is invalid.");
  }
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function updateBillingProfileAction(data: FormData) {
  requireConfirmation(data);
  const customerId = required(data, "customerId", 80);
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "BILLING_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await new UpdateCustomerBillingProfileService(new D1BillingRepository(runtime.db), new D1PricingRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).execute({
    customerId, contactName: required(data, "contactName", 200), contactEmail: required(data, "contactEmail", 254), contactPhone: optional(data, "contactPhone", 50),
  });
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function addBillingNoteAction(data: FormData) {
  requireConfirmation(data);
  const customerId = required(data, "customerId", 80);
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "BILLING_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await new AddBillingNoteService(new D1BillingRepository(runtime.db), new D1SubscriptionRepository(runtime.db), new D1PricingRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).execute({
    customerId, subscriptionId: optional(data, "subscriptionId", 80), invoiceId: optional(data, "invoiceId", 80),
    body: required(data, "body", 4_000), authorAdminUserId: principal.adminUserId,
  });
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function setNotificationPreferenceAction(data: FormData) {
  requireConfirmation(data);
  const principal = await customerPortalSession("/account#notifications");
  const channel = required(data, "channel", 20) as NotificationChannel;
  const status = required(data, "status", 20) as NotificationPreferenceStatus;
  if (!NOTIFICATION_CHANNELS.includes(channel)) throw new DomainValidationError("INVALID_CHANNEL", "Notification channel is invalid.");
  if (!(["OPTED_IN", "OPTED_OUT"] as const).includes(status)) throw new DomainValidationError("INVALID_PREFERENCE", "Notification preference is invalid.");
  const runtime = await actionRuntime({ type: "CUSTOMER", id: principal.customerId });
  await new NotificationPreferenceService(new D1NotificationRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).set({ customerId: principal.customerId, code: required(data, "code", 100), channel, status, updatedBy: principal.identityId });
  revalidatePath("/account");
}

export async function markInAppNotificationReadAction(data: FormData) {
  requireConfirmation(data);
  const principal = await customerPortalSession("/account#notifications");
  const runtime = await actionRuntime({ type: "CUSTOMER", id: principal.customerId });
  await new MarkInAppNotificationReadService(new D1NotificationRepository(runtime.db), runtime.clock, runtime.audit).execute(required(data, "deliveryId", 80), principal.customerId);
  revalidatePath("/account");
}

export async function operationalQueueAction(data: FormData) {
  requireConfirmation(data);
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  const service = new OperationalQueueService(new D1OperationalQueueRepository(runtime.db), runtime.clock, runtime.audit);
  const itemId = required(data, "itemId", 80);
  switch (required(data, "operation", 20)) {
    case "CLAIM": await service.claim(itemId, principal.adminUserId); break;
    case "COMPLETE": await service.resolve(itemId, "COMPLETED"); break;
    case "DISMISS": await service.resolve(itemId, "DISMISSED"); break;
    default: throw new DomainValidationError("INVALID_QUEUE_OPERATION", "Operational queue action is invalid.");
  }
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
}

export async function reconcileOperationalQueuesAction(data: FormData) {
  requireConfirmation(data);
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await new OperationalQueueReconciliationService(new D1OperationalQueueRepository(runtime.db), new D1OperationalProjectionSource(runtime.db), runtime.ids, runtime.clock, runtime.audit).execute();
  revalidatePath("/admin");
  revalidatePath("/admin/operations");
}

export async function reconcileCommercialNotificationsAction(data: FormData) {
  requireConfirmation(data);
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  const repository = new D1NotificationRepository(runtime.db);
  await new CommercialNotificationOrchestrationService(new D1CommercialNotificationSource(runtime.db), new QueueNotificationService(repository, runtime.ids, runtime.clock, runtime.audit), runtime.clock).reconcile();
  revalidatePath("/admin/operations");
}

export async function runSystemMaintenanceAction(data: FormData) {
  requireConfirmation(data);
  const principal = await adminPortalSession("/admin/operations", "OPERATIONS_WRITE");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await systemHardeningServices(runtime, runtime.audit).maintenance.execute(principal.adminUserId);
  revalidatePath("/admin/operations");
}
