import type { AuditRecorder } from "@/modules/audit/application/ports";
import { RecoverPendingBillingWebhookService } from "@/modules/billing/application/billing-webhook-recovery-service";
import { ReconcileBillingEventService } from "@/modules/billing/application/billing-event-reconciliation-service";
import { D1BillingProviderReferenceRepository } from "@/modules/billing/infrastructure/d1-billing-provider-reference-repository";
import { D1BillingRepository } from "@/modules/billing/infrastructure/d1-billing-repository";
import { D1BillingWebhookRepository } from "@/modules/billing/infrastructure/d1-billing-webhook-repository";
import { GetProductionReadinessService, RunSystemMaintenanceService } from "@/modules/hardening/application/system-hardening-services";
import { D1SystemHardeningRepository } from "@/modules/hardening/infrastructure/d1-system-hardening-repository";
import { D1SubscriptionRepository } from "@/modules/subscription/infrastructure/d1-subscription-repository";
import type { ApiRuntime } from "./api/v1/api-runtime";

export function systemHardeningServices(runtime: Pick<ApiRuntime, "db" | "ids" | "clock">, audit: AuditRecorder) {
  const hardening = new D1SystemHardeningRepository(runtime.db);
  const webhookRepository = new D1BillingWebhookRepository(runtime.db);
  const reconciler = new ReconcileBillingEventService(new D1SubscriptionRepository(runtime.db), new D1BillingRepository(runtime.db), runtime.ids, runtime.clock, audit, new D1BillingProviderReferenceRepository(runtime.db));
  return {
    readiness: new GetProductionReadinessService(hardening, runtime.clock),
    maintenance: new RunSystemMaintenanceService(hardening, new RecoverPendingBillingWebhookService(webhookRepository, reconciler, runtime.clock, audit), runtime.ids, runtime.clock, audit),
  };
}
