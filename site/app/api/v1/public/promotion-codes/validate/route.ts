import { ValidatePromotionCodeService } from "@/modules/discount/application/discount-services";
import { D1DiscountRepository } from "@/modules/discount/infrastructure/d1-discount-repository";
import { D1PurchaseHistoryRepository } from "@/modules/discount/infrastructure/d1-purchase-history-repository";
import { D1PricingRepository } from "@/modules/pricing/infrastructure/d1-pricing-repository";
import { apiRoute, dataResponse, jsonObject, requiredString } from "../../../api-http";
import { createApiRuntime } from "../../../api-runtime";

export async function POST(request: Request) { return apiRoute(request, async ({ requestId }) => { const runtime = await createApiRuntime(request, requestId); const body = await jsonObject(request); const result = await new ValidatePromotionCodeService(new D1DiscountRepository(runtime.db), new D1PricingRepository(runtime.db), new D1PurchaseHistoryRepository(runtime.db), runtime.clock).execute({ code: requiredString(body, "code", 80), customerId: requiredString(body, "customerId", 80), planId: requiredString(body, "planId", 80) }); const discount = result.discount.props; return dataResponse({ eligible: true, code: result.promotion.props.code.value, discount: { type: discount.discountType, percentOffBasisPoints: discount.percentOffBasisPoints, amountOffMinor: discount.amountOff?.amountMinor ?? null, currency: discount.amountOff?.currency ?? null, durationType: discount.durationType, durationMonths: discount.durationMonths } }); }); }
