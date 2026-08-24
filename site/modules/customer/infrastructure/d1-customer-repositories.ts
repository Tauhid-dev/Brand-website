import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import {
  customerBusinessProfiles,
  customerIdentities,
  customerInvitations,
  customerNotes,
  customers,
} from "../../../db/schema.ts";
import { EmailAddress, EntityId } from "../../shared/domain/value-objects.ts";
import {
  Customer,
  type CustomerBusinessProfile,
  type CustomerCreationSource,
  type CustomerNote,
  type CustomerStatus,
} from "../domain/customer.ts";
import type { CustomerIdentity, CustomerInvitation, InvitationStatus } from "../domain/customer-access.ts";
import type {
  CustomerIdentityRepository,
  CustomerInvitationRepository,
  CustomerRepository,
} from "../application/ports.ts";

export class D1CustomerRepository implements CustomerRepository {
  constructor(private readonly db: AppDatabase) {}

  async findById(id: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return row ? mapCustomer(row) : null;
  }

  async findByExternalReference(externalReference: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers)
      .where(eq(customers.externalReference, externalReference)).limit(1);
    return row ? mapCustomer(row) : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const [row] = await this.db.select().from(customers).where(eq(customers.email, email)).limit(1);
    return row ? mapCustomer(row) : null;
  }

  async save(customer: Customer, profile: CustomerBusinessProfile): Promise<void> {
    const customerValue = customer.snapshot;
    const profileValue = profile.props;
    await this.db.batch([
      this.db.insert(customers).values({
        id: customerValue.id.value,
        externalReference: customerValue.externalReference,
        businessName: customerValue.businessName,
        contactName: customerValue.contactName,
        email: customerValue.email.value,
        phone: customerValue.phone,
        industry: customerValue.industry,
        websiteUrl: customerValue.websiteUrl,
        status: customerValue.status,
        creationSource: customerValue.creationSource,
        createdAt: customerValue.createdAt,
        updatedAt: customerValue.updatedAt,
      }).onConflictDoUpdate({
        target: customers.id,
        set: {
          businessName: customerValue.businessName,
          contactName: customerValue.contactName,
          email: customerValue.email.value,
          phone: customerValue.phone,
          industry: customerValue.industry,
          websiteUrl: customerValue.websiteUrl,
          status: customerValue.status,
          updatedAt: customerValue.updatedAt,
        },
      }),
      this.db.insert(customerBusinessProfiles).values({
        id: profileValue.id.value,
        customerId: profileValue.customerId.value,
        businessName: profileValue.businessName,
        tradingName: profileValue.tradingName,
        abn: profileValue.abn,
        websiteUrl: profileValue.websiteUrl,
        primaryEmail: profileValue.primaryEmail.value,
        primaryPhone: profileValue.primaryPhone,
        industry: profileValue.industry,
        timezone: profileValue.timezone,
        country: profileValue.country,
        state: profileValue.state,
        suburb: profileValue.suburb,
        postcode: profileValue.postcode,
        createdAt: profileValue.createdAt,
        updatedAt: profileValue.updatedAt,
      }).onConflictDoUpdate({
        target: customerBusinessProfiles.customerId,
        set: {
          businessName: profileValue.businessName,
          tradingName: profileValue.tradingName,
          abn: profileValue.abn,
          websiteUrl: profileValue.websiteUrl,
          primaryEmail: profileValue.primaryEmail.value,
          primaryPhone: profileValue.primaryPhone,
          industry: profileValue.industry,
          timezone: profileValue.timezone,
          country: profileValue.country,
          state: profileValue.state,
          suburb: profileValue.suburb,
          postcode: profileValue.postcode,
          updatedAt: profileValue.updatedAt,
        },
      }),
    ]);
  }

  async addNote(note: CustomerNote): Promise<void> {
    await this.db.insert(customerNotes).values({
      id: note.id.value,
      customerId: note.customerId.value,
      body: note.body,
      authorType: note.authorType,
      authorId: note.authorId,
      createdAt: note.createdAt,
    });
  }
}

export class D1CustomerIdentityRepository implements CustomerIdentityRepository {
  constructor(private readonly db: AppDatabase) {}

  async findByProviderSubject(provider: string, externalSubject: string): Promise<CustomerIdentity | null> {
    const [row] = await this.db.select().from(customerIdentities).where(and(
      eq(customerIdentities.provider, provider.toLowerCase()),
      eq(customerIdentities.externalSubject, externalSubject),
    )).limit(1);
    return row ? {
      id: new EntityId(row.id),
      customerId: new EntityId(row.customerId),
      provider: row.provider,
      externalSubject: row.externalSubject,
      email: new EmailAddress(row.email),
      acceptedInvitationId: row.acceptedInvitationId ? new EntityId(row.acceptedInvitationId) : null,
      createdAt: row.createdAt,
    } : null;
  }

  async save(identity: CustomerIdentity): Promise<void> {
    await this.db.insert(customerIdentities).values({
      id: identity.id.value,
      customerId: identity.customerId.value,
      provider: identity.provider,
      externalSubject: identity.externalSubject,
      email: identity.email.value,
      acceptedInvitationId: identity.acceptedInvitationId?.value ?? null,
      createdAt: identity.createdAt,
    });
  }
}

export class D1CustomerInvitationRepository implements CustomerInvitationRepository {
  constructor(private readonly db: AppDatabase) {}

  async findPendingByEmail(email: string): Promise<CustomerInvitation | null> {
    const [row] = await this.db.select().from(customerInvitations).where(and(
      eq(customerInvitations.email, email),
      eq(customerInvitations.status, "PENDING"),
    )).limit(1);
    return row ? mapInvitation(row) : null;
  }

  async findPendingByTokenHash(tokenHash: string): Promise<CustomerInvitation | null> {
    const [row] = await this.db.select().from(customerInvitations).where(and(
      eq(customerInvitations.tokenHash, tokenHash),
      eq(customerInvitations.status, "PENDING"),
    )).limit(1);
    return row ? mapInvitation(row) : null;
  }

  async save(invitation: CustomerInvitation): Promise<void> {
    await this.db.insert(customerInvitations).values({
      id: invitation.id.value,
      customerId: invitation.customerId?.value ?? null,
      email: invitation.email.value,
      tokenHash: invitation.tokenHash,
      status: invitation.status,
      invitedBy: invitation.invitedBy,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt,
    });
  }

  async accept(
    invitation: CustomerInvitation,
    identity: CustomerIdentity,
    newCustomer?: { customer: Customer; profile: CustomerBusinessProfile },
  ): Promise<void> {
    const acceptance = [
      this.db.update(customerInvitations).set({
        customerId: identity.customerId.value,
        status: invitation.status,
        acceptedAt: invitation.acceptedAt,
      }).where(and(
        eq(customerInvitations.id, invitation.id.value),
        eq(customerInvitations.status, "PENDING"),
      )),
      this.db.insert(customerIdentities).values({
        id: identity.id.value,
        customerId: identity.customerId.value,
        provider: identity.provider,
        externalSubject: identity.externalSubject,
        email: identity.email.value,
        acceptedInvitationId: invitation.id.value,
        createdAt: identity.createdAt,
      }),
    ] as const;
    if (!newCustomer) {
      await this.db.batch(acceptance);
      return;
    }
    const customer = newCustomer.customer.snapshot;
    const profile = newCustomer.profile.props;
    await this.db.batch([
      this.db.insert(customers).values({
        id: customer.id.value,
        externalReference: customer.externalReference,
        businessName: customer.businessName,
        contactName: customer.contactName,
        email: customer.email.value,
        phone: customer.phone,
        industry: customer.industry,
        websiteUrl: customer.websiteUrl,
        status: customer.status,
        creationSource: customer.creationSource,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      }),
      this.db.insert(customerBusinessProfiles).values({
        id: profile.id.value,
        customerId: profile.customerId.value,
        businessName: profile.businessName,
        tradingName: profile.tradingName,
        abn: profile.abn,
        websiteUrl: profile.websiteUrl,
        primaryEmail: profile.primaryEmail.value,
        primaryPhone: profile.primaryPhone,
        industry: profile.industry,
        timezone: profile.timezone,
        country: profile.country,
        state: profile.state,
        suburb: profile.suburb,
        postcode: profile.postcode,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      }),
      ...acceptance,
    ]);
  }
}

function mapInvitation(row: typeof customerInvitations.$inferSelect): CustomerInvitation {
  return {
      id: new EntityId(row.id),
      customerId: row.customerId ? new EntityId(row.customerId) : null,
      email: new EmailAddress(row.email),
      tokenHash: row.tokenHash,
      status: row.status as InvitationStatus,
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      createdAt: row.createdAt,
  };
}

function mapCustomer(row: typeof customers.$inferSelect): Customer {
  return Customer.create({
    id: new EntityId(row.id),
    externalReference: row.externalReference,
    businessName: row.businessName,
    contactName: row.contactName,
    email: new EmailAddress(row.email),
    phone: row.phone,
    industry: row.industry,
    websiteUrl: row.websiteUrl,
    status: row.status as CustomerStatus,
    creationSource: row.creationSource as CustomerCreationSource,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
