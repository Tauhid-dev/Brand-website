import { DomainValidationError } from "../../shared/domain/errors.ts";
import { EntityId, StableCode, optionalText, requireText } from "../../shared/domain/value-objects.ts";

export type CustomerIntegrationStatus = "NOT_CONNECTED" | "PENDING" | "HEALTHY" | "DEGRADED" | "ERROR" | "DISABLED";
const SENSITIVE_KEY = /(password|secret|token|credential|authorization|cookie|api.?key|hash)/i;
export type CustomerIntegrationProps = { id: EntityId; customerId: EntityId; integrationCode: StableCode; category: string; status: CustomerIntegrationStatus; lastCheckedAt: Date | null; lastSuccessfulAt: Date | null; errorCode: string | null; metadata: Readonly<Record<string, unknown>>; version: number; createdAt: Date; updatedAt: Date };
export class CustomerIntegration {
  readonly props: Readonly<CustomerIntegrationProps>;
  constructor(input: CustomerIntegrationProps) {
    if (!["NOT_CONNECTED", "PENDING", "HEALTHY", "DEGRADED", "ERROR", "DISABLED"].includes(input.status)) throw new DomainValidationError("INVALID_INTEGRATION_STATUS", "Customer integration status is invalid.");
    if (["DEGRADED", "ERROR"].includes(input.status) !== (input.errorCode != null)) throw new DomainValidationError("INVALID_INTEGRATION_ERROR", "Degraded and errored integrations require an error code exclusively.");
    for (const key of Object.keys(input.metadata)) if (SENSITIVE_KEY.test(key)) throw new DomainValidationError("SENSITIVE_INTEGRATION_METADATA", "Integration metadata cannot contain credentials or secrets.");
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new DomainValidationError("INVALID_INTEGRATION_VERSION", "Integration version must be positive.");
    this.props = Object.freeze({ ...input, category: requireText(input.category, "category", 80).toUpperCase(), errorCode: optionalText(input.errorCode, "errorCode", 120), metadata: Object.freeze({ ...input.metadata }) });
  }
  update(status: CustomerIntegrationStatus, at: Date, errorCode: string | null = null, metadata: Readonly<Record<string, unknown>> = this.props.metadata) { return new CustomerIntegration({ ...this.props, status, lastCheckedAt: at, lastSuccessfulAt: status === "HEALTHY" ? at : this.props.lastSuccessfulAt, errorCode, metadata, version: this.props.version + 1, updatedAt: at }); }
}
