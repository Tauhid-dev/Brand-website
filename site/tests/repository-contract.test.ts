import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema.ts";
import { D1CatalogueRepository } from "../modules/catalogue/infrastructure/d1-catalogue-repository.ts";
import { Offering, Plan, createPlanFeature } from "../modules/catalogue/domain/catalogue.ts";
import { D1CustomerRepository } from "../modules/customer/infrastructure/d1-customer-repositories.ts";
import { Customer, CustomerBusinessProfile } from "../modules/customer/domain/customer.ts";
import { EmailAddress, EntityId, StableCode } from "../modules/shared/domain/value-objects.ts";

const NOW = new Date("2026-08-23T00:00:00.000Z");
const MIGRATION = readFileSync(
  new URL("../drizzle/0000_uneven_violations.sql", import.meta.url),
  "utf8",
);

class SQLiteD1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: unknown[]): SQLiteD1PreparedStatement {
    return new SQLiteD1PreparedStatement(this.database, this.query, values);
  }

  async all(): Promise<{ success: true; results: Record<string, unknown>[] }> {
    const statement = this.database.prepare(this.query);
    const results = statement.all(...(this.values as never[])) as Record<string, unknown>[];
    return { success: true, results };
  }

  async raw(): Promise<unknown[][]> {
    const { results } = await this.all();
    return results.map((row) => Object.values(row));
  }

  async run(): Promise<{ success: true; results: never[]; meta: { changes: number } }> {
    const result = this.database.prepare(this.query).run(...(this.values as never[]));
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

class SQLiteD1Database {
  readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec("PRAGMA foreign_keys = ON");
    for (const statement of MIGRATION.split("--> statement-breakpoint")) {
      if (statement.trim()) this.database.exec(statement);
    }
  }

  prepare(query: string): SQLiteD1PreparedStatement {
    return new SQLiteD1PreparedStatement(this.database, query);
  }

  async batch(statements: SQLiteD1PreparedStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

function repositoryDatabase() {
  const client = new SQLiteD1Database();
  const database = drizzle(client as unknown as D1Database, { schema });
  return { client, database };
}

test("D1 customer repository satisfies save and lookup contract", async () => {
  const { client, database } = repositoryDatabase();
  const repository = new D1CustomerRepository(database);
  const customerId = new EntityId("00000000-0000-4000-8000-000000000001");
  const customer = Customer.create({
    id: customerId,
    externalReference: "customer-001",
    businessName: "Example Plumbing Pty Ltd",
    contactName: "Casey Example",
    email: new EmailAddress("casey@example.invalid"),
    phone: null,
    industry: "Plumbing",
    websiteUrl: null,
    status: "PROSPECT",
    creationSource: "ADMIN",
    createdAt: NOW,
    updatedAt: NOW,
  });
  const profile = new CustomerBusinessProfile({
    id: new EntityId("00000000-0000-4000-8000-000000000002"),
    customerId,
    businessName: "Example Plumbing Pty Ltd",
    tradingName: null,
    abn: null,
    websiteUrl: null,
    primaryEmail: new EmailAddress("casey@example.invalid"),
    primaryPhone: null,
    industry: "Plumbing",
    timezone: "Australia/Sydney",
    country: "AU",
    state: "NSW",
    suburb: null,
    postcode: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await repository.save(customer, profile);
  assert.equal((await repository.findById(customerId.value))?.snapshot.businessName, customer.snapshot.businessName);
  assert.equal((await repository.findByEmail("casey@example.invalid"))?.snapshot.id.value, customerId.value);
  assert.equal((await repository.findByExternalReference("customer-001"))?.snapshot.id.value, customerId.value);
  client.close();
});

test("D1 catalogue repository upserts stable codes and plan features", async () => {
  const { client, database } = repositoryDatabase();
  const repository = new D1CatalogueRepository(database);
  const planId = new EntityId("00000000-0000-4000-8000-000000000010");
  const offeringId = new EntityId("00000000-0000-4000-8000-000000000011");
  await repository.saveOffering(new Offering({
    id: offeringId,
    code: new StableCode("ai_receptionist"),
    name: "AI Receptionist",
    description: null,
    category: "Automation",
    active: true,
    displayOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }));
  await repository.savePlan(new Plan({
    id: planId,
    code: new StableCode("growth_engine"),
    name: "Growth Engine",
    description: null,
    active: true,
    featured: true,
    custom: false,
    displayOrder: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }));
  await repository.savePlanFeature(createPlanFeature({
    id: new EntityId("00000000-0000-4000-8000-000000000012"),
    planId,
    offeringId,
    included: true,
    limitValue: 500,
    limitUnit: "conversations_per_month",
    configuration: { channel: "phone" },
    createdAt: NOW,
    updatedAt: NOW,
  }));
  assert.equal((await repository.findOfferingByCode("ai_receptionist"))?.props.category, "Automation");
  assert.equal((await repository.findPlanByCode("growth_engine"))?.props.featured, true);
  assert.equal(client.database.prepare("select count(*) as count from plan_features").get()?.count, 1);
  client.close();
});
