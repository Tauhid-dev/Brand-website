import { DomainConflictError } from "../../shared/domain/errors.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import type { Clock, IdGenerator } from "../../shared/application/ports.ts";
import {
  Customer,
  CustomerBusinessProfile,
  createCustomerNote,
  type CustomerCreationSource,
} from "../domain/customer.ts";
import { createCustomerIdentity, createCustomerInvitation } from "../domain/customer-access.ts";
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
  ) {}

  async execute(input: CreateCustomerInput): Promise<Customer> {
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
    await this.customers.save(customer, profile);
    return customer;
  }
}

export class RegisterCustomerService {
  constructor(
    private readonly createCustomer: CreateCustomerService,
    private readonly identities: CustomerIdentityRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: Omit<CreateCustomerInput, "creationSource"> & { provider: string; externalSubject: string },
  ): Promise<Customer> {
    if (await this.identities.findByProviderSubject(input.provider, input.externalSubject)) {
      throw new DomainConflictError("IDENTITY_EXISTS", "This identity is already registered.");
    }
    const customer = await this.createCustomer.execute({ ...input, creationSource: "SELF_REGISTRATION" });
    await this.identities.save(createCustomerIdentity({
      id: new EntityId(this.ids.next()),
      customerId: customer.snapshot.id,
      provider: input.provider,
      externalSubject: input.externalSubject,
      email: customer.snapshot.email,
      createdAt: this.clock.now(),
    }));
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
    await this.delivery.send({ email: email.value, rawToken: token.rawToken, expiresAt: invitation.expiresAt });
  }
}

export class AddCustomerNoteService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
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
  }
}
