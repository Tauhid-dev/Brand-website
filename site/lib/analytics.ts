export type AnalyticsEvent =
  | "primary_cta_click" | "secondary_cta_click" | "pricing_plan_interest"
  | "phone_click" | "whatsapp_click" | "audit_form_started" | "audit_form_completed"
  | "contact_form_completed" | "ai_demo_opened" | "ai_demo_completed"
  | "faq_interaction" | "industry_cta_click";

const blockedKeys = /name|email|phone|message|content|address|suburb|business/i;

export function sanitiseAnalyticsProperties(input: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) =>
      !blockedKeys.test(key) && ["string", "number", "boolean"].includes(typeof value),
    ),
  );
}

export function track(event: AnalyticsEvent, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const detail = { event, properties: sanitiseAnalyticsProperties(properties) };
  window.dispatchEvent(new CustomEvent("ai-magnet:analytics", { detail }));
}
