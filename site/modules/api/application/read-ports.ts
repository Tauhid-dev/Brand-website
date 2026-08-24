export type CursorPosition = { createdAt: Date; id: string };
export type ApiPage<T> = { items: T[]; next: CursorPosition | null };

export interface ApiReadRepository {
  listPublicPlans(at: Date): Promise<Array<Record<string, unknown>>>;
  getPublicPlan(code: string, at: Date): Promise<Record<string, unknown> | null>;
  listCustomers(input: { cursor: CursorPosition | null; limit: number; status?: string; query?: string }): Promise<ApiPage<Record<string, unknown>>>;
  listSubscriptions(input: { cursor: CursorPosition | null; limit: number; status?: string; customerId?: string; planId?: string }): Promise<ApiPage<Record<string, unknown>>>;
  listDiscounts(input: { cursor: CursorPosition | null; limit: number; active?: boolean }): Promise<ApiPage<Record<string, unknown>>>;
  listPromotionCodes(input: { cursor: CursorPosition | null; limit: number; active?: boolean }): Promise<ApiPage<Record<string, unknown>>>;
  listAuditEvents(input: { cursor: CursorPosition | null; limit: number; action?: string; entityType?: string }): Promise<ApiPage<Record<string, unknown>>>;
}
