import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, requireText } from "../../shared/domain/value-objects.ts";
import type { RequestActor } from "../../shared/application/request-context.ts";

export const AUDIT_ACTIONS = {
  customerCreated: "CUSTOMER_CREATED",
  customerInvited: "CUSTOMER_INVITED",
  customerInvitationAccepted: "CUSTOMER_INVITATION_ACCEPTED",
  customerIdentityLinked: "CUSTOMER_IDENTITY_LINKED",
  customerNoteAdded: "CUSTOMER_NOTE_ADDED",
  offeringCreated: "OFFERING_CREATED",
  planCreated: "PLAN_CREATED",
  planFeatureChanged: "PLAN_FEATURE_CHANGED",
  planPricePublished: "PLAN_PRICE_PUBLISHED",
  customerPriceOverrideCreated: "CUSTOMER_PRICE_OVERRIDE_CREATED",
  priceQuoteCreated: "PRICE_QUOTE_CREATED",
  discountCreated: "DISCOUNT_CREATED",
  promotionCodeCreated: "PROMOTION_CODE_CREATED",
  customerDiscountApplied: "CUSTOMER_DISCOUNT_APPLIED",
  promotionCodeRedeemed: "PROMOTION_CODE_REDEEMED",
  discountApplicationRecorded: "DISCOUNT_APPLICATION_RECORDED",
  subscriptionCreated: "SUBSCRIPTION_CREATED",
  subscriptionChanged: "SUBSCRIPTION_CHANGED",
  subscriptionPastDue: "SUBSCRIPTION_PAST_DUE",
  subscriptionSuspended: "SUBSCRIPTION_SUSPENDED",
  subscriptionResumed: "SUBSCRIPTION_RESUMED",
  subscriptionCancellationScheduled: "SUBSCRIPTION_CANCELLATION_SCHEDULED",
  subscriptionCancelled: "SUBSCRIPTION_CANCELLED",
  subscriptionServiceExtended: "SUBSCRIPTION_SERVICE_EXTENDED",
  subscriptionPriceScheduled: "SUBSCRIPTION_PRICE_SCHEDULED",
  billingAccountLinked: "BILLING_ACCOUNT_LINKED",
  billingProfileChanged: "BILLING_PROFILE_CHANGED",
  billingNoteAdded: "BILLING_NOTE_ADDED",
  invoiceCreated: "INVOICE_CREATED",
  invoiceChanged: "INVOICE_CHANGED",
  paymentReminderScheduled: "PAYMENT_REMINDER_SCHEDULED",
  paymentReminderUpdated: "PAYMENT_REMINDER_UPDATED",
  adminLoginSuccess: "ADMIN_LOGIN_SUCCESS",
  adminLoginFailed: "ADMIN_LOGIN_FAILED",
  adminUserCreated: "ADMIN_USER_CREATED",
  adminUserStatusChanged: "ADMIN_USER_STATUS_CHANGED",
  adminRoleAssigned: "ADMIN_ROLE_ASSIGNED",
  adminRoleRevoked: "ADMIN_ROLE_REVOKED",
  rolePermissionGranted: "ROLE_PERMISSION_GRANTED",
  rolePermissionRevoked: "ROLE_PERMISSION_REVOKED",
  onboardingCaseCreated: "ONBOARDING_CASE_CREATED",
  onboardingCaseChanged: "ONBOARDING_CASE_CHANGED",
  onboardingCaseCompleted: "ONBOARDING_CASE_COMPLETED",
  onboardingCaseCancelled: "ONBOARDING_CASE_CANCELLED",
  onboardingTaskChanged: "ONBOARDING_TASK_CHANGED",
  customerIntegrationRegistered: "CUSTOMER_INTEGRATION_REGISTERED",
  customerIntegrationChanged: "CUSTOMER_INTEGRATION_CHANGED",
  operationalQueueItemClaimed: "OPERATIONAL_QUEUE_ITEM_CLAIMED",
  operationalQueueItemCompleted: "OPERATIONAL_QUEUE_ITEM_COMPLETED",
  operationalQueueItemDismissed: "OPERATIONAL_QUEUE_ITEM_DISMISSED",
  billingAttentionProjected: "BILLING_ATTENTION_PROJECTED",
  notificationTemplatePublished: "NOTIFICATION_TEMPLATE_PUBLISHED",
  notificationPreferenceChanged: "NOTIFICATION_PREFERENCE_CHANGED",
  notificationQueued: "NOTIFICATION_QUEUED",
  notificationSent: "NOTIFICATION_SENT",
  notificationRetryScheduled: "NOTIFICATION_RETRY_SCHEDULED",
  notificationFailed: "NOTIFICATION_FAILED",
  notificationCancelled: "NOTIFICATION_CANCELLED",
  notificationRead: "NOTIFICATION_READ",
  operationalQueuesReconciled: "OPERATIONAL_QUEUES_RECONCILED",
  agentProvisioningRequested: "AGENT_PROVISIONING_REQUESTED",
  agentProvisioningSucceeded: "AGENT_PROVISIONING_SUCCEEDED",
  agentProvisioningRetryScheduled: "AGENT_PROVISIONING_RETRY_SCHEDULED",
  agentProvisioningFailed: "AGENT_PROVISIONING_FAILED",
  agentLinkSynchronized: "AGENT_LINK_SYNCHRONIZED",
  serviceCredentialCreated: "SERVICE_CREDENTIAL_CREATED",
  serviceCredentialRotated: "SERVICE_CREDENTIAL_ROTATED",
  serviceCredentialRevoked: "SERVICE_CREDENTIAL_REVOKED",
  serviceAuthenticationFailed: "SERVICE_AUTHENTICATION_FAILED",
  serviceApiRequested: "SERVICE_API_REQUESTED",
  billingWebhookReceived: "BILLING_WEBHOOK_RECEIVED",
  billingWebhookProcessed: "BILLING_WEBHOOK_PROCESSED",
  billingWebhookIgnored: "BILLING_WEBHOOK_IGNORED",
  billingWebhookFailed: "BILLING_WEBHOOK_FAILED",
} as const;

export type AuditJson = null | boolean | number | string | AuditJson[] | { [key: string]: AuditJson };

export type AuditEventProps = {
  id: EntityId;
  actor: RequestActor;
  action: string;
  entityType: string;
  entityId: string | null;
  before: AuditJson;
  after: AuditJson;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export class AuditEvent {
  readonly props: Readonly<AuditEventProps>;

  constructor(input: AuditEventProps) {
    const action = requireText(input.action, "action", 120).toUpperCase();
    const entityType = requireText(input.entityType, "entityType", 120).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(action) || !/^[A-Z][A-Z0-9_]*$/.test(entityType)) {
      throw new DomainValidationError("INVALID_AUDIT_CODE", "Audit action and entity type must be stable uppercase codes.");
    }
    if (!Number.isFinite(input.createdAt.getTime())) {
      throw new DomainValidationError("INVALID_AUDIT_TIMESTAMP", "Audit timestamp must be valid.");
    }
    if (input.actor.type !== "ANONYMOUS") requireText(input.actor.id, "actorId", 255);
    this.props = Object.freeze({
      ...input,
      action,
      entityType,
      entityId: input.entityId?.trim().slice(0, 255) || null,
      requestId: requireText(input.requestId, "requestId", 255),
      ipAddress: input.ipAddress?.trim().slice(0, 64) || null,
      userAgent: input.userAgent?.trim().slice(0, 512) || null,
    });
  }
}
