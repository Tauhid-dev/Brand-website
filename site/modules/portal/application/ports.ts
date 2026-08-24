export type PortalCustomerSummary = {
  id: string;
  externalReference: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string | null;
  status: string;
  subscriptionStatus: string | null;
  planName: string | null;
  createdAt: Date;
};

export type CustomerAccountView = {
  customer: PortalCustomerSummary & { industry: string | null; websiteUrl: string | null };
  profile: Record<string, unknown> | null;
  onboarding: { id: string; status: string; tasks: Array<Record<string, unknown>> } | null;
  integrations: Array<Record<string, unknown>>;
  subscription: (Record<string, unknown> & { id: string; status: string; planName: string }) | null;
  entitlements: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  reminders: Array<Record<string, unknown>>;
  agentLinks: Array<Record<string, unknown>>;
  agentJobs: Array<Record<string, unknown>>;
  notificationPreferences: Array<Record<string, unknown>>;
};

export type AdminDashboardView = {
  metrics: { customers: number; currentSubscriptions: number; onboardingAttention: number; openInvoices: number; openQueueItems: number };
  queues: Array<Record<string, unknown>>;
  recentCustomers: PortalCustomerSummary[];
};

export type AdminCustomerView = CustomerAccountView & {
  notes: Array<Record<string, unknown>>;
  priceOverrides: Array<Record<string, unknown>>;
  discounts: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
};

export interface PortalReadRepository {
  getCustomerAccount(customerId: string): Promise<CustomerAccountView | null>;
  getAdminDashboard(): Promise<AdminDashboardView>;
  searchCustomers(input: { query?: string; subscriptionStatus?: string; limit?: number }): Promise<PortalCustomerSummary[]>;
  getAdminCustomer(customerId: string): Promise<AdminCustomerView | null>;
  getCatalogue(): Promise<{ plans: Array<Record<string, unknown>>; offerings: Array<Record<string, unknown>>; features: Array<Record<string, unknown>>; prices: Array<Record<string, unknown>> }>;
  getPricing(): Promise<{ prices: Array<Record<string, unknown>>; overrides: Array<Record<string, unknown>>; quotes: Array<Record<string, unknown>> }>;
  getDiscounts(): Promise<{ discounts: Array<Record<string, unknown>>; promotions: Array<Record<string, unknown>>; assignments: Array<Record<string, unknown>>; redemptions: Array<Record<string, unknown>> }>;
  getSubscriptions(): Promise<Array<Record<string, unknown>>>;
  getBilling(at?: Date): Promise<{ invoices: Array<Record<string, unknown>>; reminders: Array<Record<string, unknown>> }>;
  getAgents(): Promise<{ links: Array<Record<string, unknown>>; jobs: Array<Record<string, unknown>> }>;
  getAuditEvents(limit?: number): Promise<Array<Record<string, unknown>>>;
  getAdminUsers(): Promise<Array<Record<string, unknown>>>;
}
