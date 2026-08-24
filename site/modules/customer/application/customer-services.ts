import { DomainConflictError, DomainValidationError } from "../../shared/domain/errors.ts";
import type { AuditRecorder } from "../../audit/application/ports.ts";
import { AUDIT_ACTIONS } from "../../audit/domain/audit-event.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import {
  Customer,
  CustomerBusinessProfile,
  createCustomerNote,
  type CustomerCreationSource,
} from "../domain/customer.ts";
import {
  acceptCustomerInvitation,
  createCustomerIdentity,
  createCustomerInvitation,
} from "../domain/customer-access.ts";
import type {
  CustomerIdentityRepository,
  CustomerInvitationRepository,
  CustomerRepository,
  InvitationDeliveryPort,
  InvitationTokenPort,
} from "./ports.ts";

export type CreateCustomerInput = {
  externalReference: string;
  businessName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  industry?: string | null;
  websiteUrl?: string | null;
  tradingName?: string | null;
  abn?: string | null;
  timezone?: string;
  state?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  creationSource: CustomerCreationSource;
};

export class CreateCustomerService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async build(input: CreateCustomerInput): Promise<{
    customer: Customer;
    profile: CustomerBusinessProfile;
  }> {
    const email = new EmailAddress(input.email);
    if (await this.customers.findByExternalReference(input.externalReference.trim())) {
      throw new DomainConflictError("CUSTOMER_REFERENCE_EXISTS", "Customer reference already exists.");
    }
    if (await this.customers.findByEmail(email.value)) {
      throw new DomainConflictError("CUSTOMER_EMAIL_EXISTS", "Customer email already exists.");
    }

    const now = this.clock.now();
    const customerId = new EntityId(this.ids.next());
    const customer = Customer.create({
      id: customerId,
      externalReference: input.externalReference,
      businessName: input.businessName,
      contactName: input.contactName,
      email,
      phone: input.phone ?? null,
      industry: input.industry ?? null,
      websiteUrl: input.websiteUrl ?? null,
      status: "PROSPECT",
      creationSource: input.creationSource,
      createdAt: now,
      updatedAt: now,
    });
    const profile = new CustomerBusinessProfile({
      id: new EntityId(this.ids.next()),
      customerId,
      businessName: input.businessName,
      tradingName: input.tradingName ?? null,
      abn: input.abn ?? null,
      websiteUrl: input.websiteUrl ?? null,
      primaryEmail: email,
      primaryPhone: input.phone ?? null,
      industry: input.industry ?? null,
      timezone: input.timezone ?? "Australia/Sydney",
      country: "AU",
      state: input.state ?? null,
      suburb: input.suburb ?? null,
      postcode: input.postcode ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return { customer, profile };
  }

  async execute(input: CreateCustomerInput): Promise<Customer> {
    const { customer, profile } = await this.build(input);
    await this.customers.save(customer, profile);
    await this.audit.record({
      action: AUDIT_ACTIONS.customerCreated,
      entityType: "CUSTOMER",
      entityId: customer.snapshot.id.value,
      after: customer.snapshot,
    });
    return customer;
  }
}

export class RegisterCustomerService {
  constructor(
    private readonly createCustomer: CreateCustomerService,
    private readonly identities: CustomerIdentityRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(
    input: Omit<CreateCustomerInput, "creationSource"> & { provider: string; externalSubject: string },
  ): Promise<Customer> {
    if (await this.identities.findByProviderSubject(input.provider, input.externalSubject)) {
      throw new DomainConflictError("IDENTITY_EXISTS", "This identity is already registered.");
    }
    const customer = await this.createCustomer.execute({ ...input, creationSource: "SELF_REGISTRATION" });
    const identity = createCustomerIdentity({
      id: new EntityId(this.ids.next()),
      customerId: customer.snapshot.id,
      provider: input.provider,
      externalSubject: input.externalSubject,
      email: customer.snapshot.email,
      acceptedInvitationId: null,
      createdAt: this.clock.now(),
    });
    await this.identities.save(identity);
    await this.audit.record({
      action: AUDIT_ACTIONS.customerIdentityLinked,
      entityType: "CUSTOMER_IDENTITY",
      entityId: identity.id.value,
      after: { customerId: customer.snapshot.id.value, provider: identity.provider, email: identity.email.value },
    });
    return customer;
  }
}

export class InviteCustomerService {
  constructor(
    private readonly invitations: CustomerInvitationRepository,
    private readonly tokens: InvitationTokenPort,
    private readonly delivery: InvitationDeliveryPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: {
    email: string;
    invitedBy: string;
    customerId?: string | null;
    expiresInHours?: number;
  }): Promise<void> {
    const email = new EmailAddress(input.email);
    if (await this.invitations.findPendingByEmail(email.value)) {
      throw new DomainConflictError("PENDING_INVITATION_EXISTS", "A pending invitation already exists.");
    }
    const now = this.clock.now();
    const expiresInHours = input.expiresInHours ?? 72;
    const token = await this.tokens.create();
    const invitation = createCustomerInvitation({
      id: new EntityId(this.ids.next()),
      customerId: input.customerId ? new EntityId(input.customerId) : null,
      email,
      tokenHash: token.tokenHash,
      status: "PENDING",
      invitedBy: input.invitedBy,
      expiresAt: new Date(now.getTime() + expiresInHours * 3_600_000),
      acceptedAt: null,
      createdAt: now,
    });
    await this.invitations.save(invitation);
    await this.audit.record({
      action: AUDIT_ACTIONS.customerInvited,
      entityType: "CUSTOMER_INVITATION",
      entityId: invitation.id.value,
      after: {
        customerId: invitation.customerId?.value ?? null,
        email: invitation.email.value,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      },
    });
    await this.delivery.send({ email: email.value, rawToken: token.rawToken, expiresAt: invitation.expiresAt });
  }
}

export class AcceptCustomerInvitationService {
  constructor(
    private readonly createCustomer: CreateCustomerService,
    private readonly customers: CustomerRepository,
    private readonly identities: CustomerIdentityRepository,
    private readonly invitations: CustomerInvitationRepository,
    private readonly tokens: InvitationTokenPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: {
    rawToken: string;
    provider: string;
    externalSubject: string;
    authenticatedEmail: string;
    customer?: Omit<CreateCustomerInput, "email" | "creationSource">;
  }): Promise<Customer> {
    const tokenHash = await this.tokens.hash(input.rawToken);
    const invitation = await this.invitations.findPendingByTokenHash(tokenHash);
    if (!invitation) throw new DomainConflictError("INVITATION_NOT_FOUND", "Invitation is invalid or has already been used.");
    const authenticatedEmail = new EmailAddress(input.authenticatedEmail);
    if (authenticatedEmail.value !== invitation.email.value) {
      throw new DomainConflictError("INVITATION_EMAIL_MISMATCH", "Invitation belongs to another signed-in email.");
    }
    if (await this.identities.findByProviderSubject(input.provider, input.externalSubject)) {
      throw new DomainConflictError("IDENTITY_EXISTS", "This identity is already registered.");
    }
    const acceptedAt = this.clock.now();
    const accepted = acceptCustomerInvitation(invitation, acceptedAt);
    let customer: Customer | null;
    let newCustomer: { customer: Customer; profile: CustomerBusinessProfile } | undefined;
    if (invitation.customerId) {
      customer = await this.customers.findById(invitation.customerId.value);
      if (!customer) throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Invited customer does not exist.");
    } else {
      if (!input.customer) {
        throw new DomainValidationError("INVITED_CUSTOMER_DETAILS_REQUIRED", "Customer details are required for an unbound invitation.");
      }
      newCustomer = await this.createCustomer.build({
        ...input.customer,
        email: authenticatedEmail.value,
        creationSource: "INVITATION",
      });
      customer = newCustomer.customer;
    }
    const identity = createCustomerIdentity({
      id: new EntityId(this.ids.next()),
      customerId: customer.snapshot.id,
      provider: input.provider,
      externalSubject: input.externalSubject,
      email: authenticatedEmail,
      acceptedInvitationId: invitation.id,
      createdAt: acceptedAt,
    });
    await this.invitations.accept(accepted, identity, newCustomer);
    if (newCustomer) {
      await this.audit.record({
        action: AUDIT_ACTIONS.customerCreated,
        entityType: "CUSTOMER",
        entityId: customer.snapshot.id.value,
        after: customer.snapshot,
      });
    }
    await this.audit.record({
      action: AUDIT_ACTIONS.customerInvitationAccepted,
      entityType: "CUSTOMER_INVITATION",
      entityId: invitation.id.value,
      before: { status: invitation.status, customerId: invitation.customerId?.value ?? null },
      after: { status: accepted.status, customerId: customer.snapshot.id.value, identityId: identity.id.value },
    });
    return customer;
  }
}

export class AddCustomerNoteService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(input: {
    customerId: string;
    body: string;
    authorType: "ADMIN" | "SYSTEM";
    authorId: string;
  }): Promise<void> {
    const customerId = new EntityId(input.customerId);
    if (!await this.customers.findById(customerId.value)) {
      throw new DomainConflictError("CUSTOMER_NOT_FOUND", "Customer does not exist.");
    }
    await this.customers.addNote(createCustomerNote({
      id: new EntityId(this.ids.next()),
      customerId,
      body: input.body,
      authorType: input.authorType,
      authorId: input.authorId,
      createdAt: this.clock.now(),
    }));
    await this.audit.record({
      action: AUDIT_ACTIONS.customerNoteAdded,
      entityType: "CUSTOMER",
      entityId: customerId.value,
      after: { authorType: input.authorType, authorId: input.authorId, noteAdded: true },
    });
  }
}
