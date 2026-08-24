"use server";

import { revalidatePath } from "next/cache";
import { AddCustomerNoteService } from "@/modules/customer/application/customer-services";
import { D1CustomerRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { NotificationPreferenceService } from "@/modules/notification/application/notification-services";
import type { NotificationChannel, NotificationPreferenceStatus } from "@/modules/notification/domain/notification";
import { D1NotificationRepository } from "@/modules/notification/infrastructure/d1-notification-repository";
import { SubscriptionLifecycleService } from "@/modules/subscription/application/subscription-services";
import type { SubscriptionStatus } from "@/modules/subscription/domain/subscription";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import { DomainValidationError } from "@/modules/shared/domain/errors";
import { actionRuntime, adminPortalSession, customerPortalSession } from "./portal-server";

function requireConfirmation(data: FormData) {
  if (data.get("confirmed") !== "yes") throw new DomainValidationError("CONFIRMATION_REQUIRED", "Explicit confirmation is required.");
}

function required(data: FormData, name: string, max = 500) {
  const value = String(data.get(name) ?? "").trim();
  if (!value || value.length > max) throw new DomainValidationError("INVALID_FORM_VALUE", `${name} is invalid.`);
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

export async function changeSubscriptionAction(data: FormData) {
  requireConfirmation(data);
  const customerId = required(data, "customerId", 80);
  const principal = await adminPortalSession(`/admin/customers/${customerId}`, "SUBSCRIPTION_WRITE");
  const target = required(data, "target", 20) as SubscriptionStatus;
  if (!(["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"] as const).includes(target as "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED")) throw new DomainValidationError("INVALID_SUBSCRIPTION_TARGET", "Subscription target is invalid.");
  const runtime = await actionRuntime({ type: "ADMIN", id: principal.adminUserId });
  await new SubscriptionLifecycleService(new D1SubscriptionRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).transition(required(data, "subscriptionId", 80), target);
  revalidatePath(`/admin/customers/${customerId}`);
}

export async function setNotificationPreferenceAction(data: FormData) {
  requireConfirmation(data);
  const principal = await customerPortalSession("/account#notifications");
  const channel = required(data, "channel", 20) as NotificationChannel;
  const status = required(data, "status", 20) as NotificationPreferenceStatus;
  if (!(["EMAIL", "SMS", "IN_APP"] as const).includes(channel)) throw new DomainValidationError("INVALID_CHANNEL", "Notification channel is invalid.");
  if (!(["OPTED_IN", "OPTED_OUT"] as const).includes(status)) throw new DomainValidationError("INVALID_PREFERENCE", "Notification preference is invalid.");
  const runtime = await actionRuntime({ type: "CUSTOMER", id: principal.customerId });
  await new NotificationPreferenceService(new D1NotificationRepository(runtime.db), runtime.ids, runtime.clock, runtime.audit).set({ customerId: principal.customerId, code: required(data, "code", 100), channel, status, updatedBy: principal.identityId });
  revalidatePath("/account");
}
