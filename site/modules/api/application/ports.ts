import type { IdempotencyRecord, ServiceCredential } from "../domain/api-security.ts";

export interface ApiSecurityRepository {
  createCredential(credential: ServiceCredential): Promise<void>;
  rotateCredential(previous: ServiceCredential, next: ServiceCredential): Promise<void>;
  revokeCredential(credential: ServiceCredential): Promise<void>;
  findCredential(id: string): Promise<ServiceCredential | null>;
  markCredentialUsed(id: string, at: Date): Promise<void>;
  consumeRateLimit(credentialId: string, windowStartedAt: Date, at: Date): Promise<number>;
  claimIdempotency(record: IdempotencyRecord): Promise<IdempotencyRecord>;
  completeIdempotency(id: string, status: number, body: unknown, at: Date): Promise<void>;
  releaseIdempotency(id: string): Promise<void>;
}
