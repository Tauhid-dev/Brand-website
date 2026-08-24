export type SortDirection = "asc" | "desc";
export type CursorPosition = { createdAt: Date; id: string; direction: SortDirection };
export type ApiPage<T> = { items: T[]; next: CursorPosition | null };
export type PageInput = { cursor: CursorPosition | null; limit: number; direction: SortDirection };

export type CustomerListDto = {
  id: string; externalReference: string; businessName: string; contactName: string;
  email: string; phone: string | null; industry: string | null; websiteUrl: string | null;
  status: string; creationSource: string; createdAt: Date; updatedAt: Date;
};

export type SubscriptionListDto = {
  id: string; customerId: string; customerName: string; planId: string; planCode: string;
  planName: string; status: string; billingInterval: string; currency: string;
  startedAt: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null; serviceExtendedUntil: Date | null; cancelAt: Date | null;
  cancelledAt: Date | null; trialEndsAt: Date | null; version: number; createdAt: Date; updatedAt: Date;
};

export type InvoiceListDto = {
  id: string; customerId: string; customerName: string; subscriptionId: string | null;
  invoiceNumber: string; status: string; currency: string; subtotalMinor: number;
  taxMinor: number; totalMinor: number; amountDueMinor: number; issuedAt: Date | null;
  dueAt: Date | null; paidAt: Date | null; createdAt: Date; updatedAt: Date;
};

export type DiscountListDto = {
  id: string; code: string; name: string; description: string | null; discountType: string;
  percentOffBasisPoints: number | null; amountOffMinor: number | null; currency: string | null;
  durationType: string; durationMonths: number | null; startsAt: Date; endsAt: Date | null;
  maxRedemptions: number | null; active: boolean; stackable: boolean;
  createdAt: Date; updatedAt: Date;
};

export type PromotionCodeListDto = {
  id: string; discountId: string; discountCode: string; discountName: string; code: string;
  customerId: string | null; planId: string | null; startsAt: Date; expiresAt: Date | null;
  maxRedemptions: number | null; redemptionCount: number; firstPurchaseOnly: boolean;
  active: boolean; createdAt: Date; updatedAt: Date;
};

export type NotificationListDto = {
  id: string; code: string; customerId: string | null; recipientType: string;
  channel: string; status: string; scheduledFor: Date; attemptCount: number; maxAttempts: number;
  nextAttemptAt: Date | null; sentAt: Date | null; cancelledAt: Date | null; readAt: Date | null;
  errorCategory: string | null; createdAt: Date; updatedAt: Date;
};

export type AuditEventListDto = {
  id: string; actorType: string; actorId: string | null; action: string; entityType: string;
  entityId: string | null; before: unknown; after: unknown; requestId: string; createdAt: Date;
};

export type PlanDto = { id: string; code: string; name: string; description: string | null; active: boolean; featured: boolean; custom: boolean; displayOrder: number; createdAt: Date; updatedAt: Date };
export type OfferingDto = { id: string; code: string; name: string; description: string | null; category: string; active: boolean; displayOrder: number; createdAt: Date; updatedAt: Date };
export type PlanPriceDto = { id: string; planId: string; planName: string; billingInterval: string; amountMinor: number; setupFeeMinor: number; currency: string; taxBehaviour: string; effectiveFrom: Date; effectiveTo: Date | null; active: boolean; createdAt: Date };

export interface ApiReadRepository {
  listPublicPlans(at: Date): Promise<Array<Record<string, unknown>>>;
  getPublicPlan(code: string, at: Date): Promise<Record<string, unknown> | null>;
  listPlans(): Promise<PlanDto[]>;
  listOfferings(): Promise<OfferingDto[]>;
  listPrices(): Promise<PlanPriceDto[]>;
  listCustomers(input: PageInput & { status?: string; query?: string }): Promise<ApiPage<CustomerListDto>>;
  listSubscriptions(input: PageInput & { status?: string; customerId?: string; planId?: string }): Promise<ApiPage<SubscriptionListDto>>;
  listInvoices(input: PageInput & { status?: string; customerId?: string; subscriptionId?: string }): Promise<ApiPage<InvoiceListDto>>;
  listDiscounts(input: PageInput & { active?: boolean }): Promise<ApiPage<DiscountListDto>>;
  listPromotionCodes(input: PageInput & { active?: boolean }): Promise<ApiPage<PromotionCodeListDto>>;
  listNotifications(input: PageInput & { status?: string; channel?: string; customerId?: string; code?: string }): Promise<ApiPage<NotificationListDto>>;
  listAuditEvents(input: PageInput & { action?: string; entityType?: string }): Promise<ApiPage<AuditEventListDto>>;
}
