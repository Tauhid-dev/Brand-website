import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../../../db/index.ts";
import { invoices } from "../../../db/schema.ts";
import type { PurchaseHistoryPort } from "../application/ports.ts";

export class D1PurchaseHistoryRepository implements PurchaseHistoryPort {
  constructor(private readonly db: AppDatabase) {}
  async hasPriorPurchase(customerId: string) { const [row] = await this.db.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.customerId, customerId), eq(invoices.status, "PAID"))).limit(1); return row != null; }
}
