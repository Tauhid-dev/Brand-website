import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId, requireText } from "../../shared/domain/value-objects.ts";

export type CustomerIdentity = {
  id: EntityId;
  customerId: EntityId;
  provider: string;
  externalSubject: string;
  email: EmailAddress;
  acceptedInvitationId: EntityId | null;
  createdAt: Date;
};

export function createCustomerIdentity(input: CustomerIdentity): CustomerIdentity {
  return {
    ...input,
    provider: requireText(input.provider, "provider", 80).toLowerCase(),
    externalSubject: requireText(input.externalSubject, "externalSubject", 255),
  };
}

export function acceptCustomerInvitation(invitation: CustomerInvitation, acceptedAt: Date): CustomerInvitation {
  if (invitation.status !== "PENDING") {
    throw new DomainValidationError("INVITATION_NOT_PENDING", "Invitation is not pending.");
  }
  if (acceptedAt >= invitation.expiresAt) {
    throw new DomainValidationError("INVITATION_EXPIRED", "Invitation has expired.");
  }
  return createCustomerInvitation({ ...invitation, status: "ACCEPTED", acceptedAt });
}

export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export type CustomerInvitation = {
  id: EntityId;
  customerId: EntityId | null;
  email: EmailAddress;
  tokenHash: string;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

export function createCustomerInvitation(input: CustomerInvitation): CustomerInvitation {
  if (!INVITATION_STATUSES.includes(input.status)) {
    throw new DomainValidationError("INVALID_INVITATION_STATUS", "Invitation status is invalid.");
  }
  if (input.expiresAt <= input.createdAt) {
    throw new DomainValidationError("INVALID_INVITATION_EXPIRY", "Invitation expiry must be in the future.");
  }
  if (input.status === "ACCEPTED" && input.acceptedAt == null) {
    throw new DomainValidationError("MISSING_ACCEPTED_AT", "Accepted invitations require acceptedAt.");
  }
  if (input.status !== "ACCEPTED" && input.acceptedAt != null) {
    throw new DomainValidationError(
      "UNEXPECTED_ACCEPTED_AT",
      "Only accepted invitations may have acceptedAt.",
    );
  }
  return {
    ...input,
    tokenHash: requireText(input.tokenHash, "tokenHash", 255),
    invitedBy: requireText(input.invitedBy, "invitedBy", 200),
  };
}
