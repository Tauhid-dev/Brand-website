import type {
  Customer,
  CustomerBusinessProfile,
  CustomerNote,
} from "../domain/customer.ts";
import type { CustomerIdentity, CustomerInvitation } from "../domain/customer-access.ts";

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByExternalReference(externalReference: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer, profile: CustomerBusinessProfile): Promise<void>;
  addNote(note: CustomerNote): Promise<void>;
}

export interface CustomerIdentityRepository {
  findByProviderSubject(provider: string, externalSubject: string): Promise<CustomerIdentity | null>;
  save(identity: CustomerIdentity): Promise<void>;
}

export interface CustomerInvitationRepository {
  findPendingByEmail(email: string): Promise<CustomerInvitation | null>;
  findPendingByTokenHash(tokenHash: string): Promise<CustomerInvitation | null>;
  save(invitation: CustomerInvitation): Promise<void>;
  accept(
    invitation: CustomerInvitation,
    identity: CustomerIdentity,
    newCustomer?: { customer: Customer; profile: CustomerBusinessProfile },
  ): Promise<void>;
}

export interface InvitationTokenPort {
  create(): Promise<{ rawToken: string; tokenHash: string }>;
  hash(rawToken: string): Promise<string>;
}

export interface InvitationDeliveryPort {
  send(input: { email: string; rawToken: string; expiresAt: Date }): Promise<void>;
}
