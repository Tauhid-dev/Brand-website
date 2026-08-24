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
  subscriptionPriceScheduled: "SUBSCRIPTION_PRICE_SCHEDULED",
  billingAccountLinked: "BILLING_ACCOUNT_LINKED",
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
