import type { Clock } from "../../shared/application/ports.ts";

export type WebsiteLeadSubmission = {
  source: "website_growth_audit" | "website_contact";
  contactName: string;
  businessName: string;
  industry: string;
  location: string;
  email: string;
  phone: string;
  challenge: string;
  websiteUrl: string | null;
  googleProfileUrl: string | null;
  websiteStatus: string | null;
  googleStatus: string | null;
  interestAreas: readonly string[];
  contactMethod: string | null;
  consultationTime: string | null;
  privacyConsent: true;
  marketingConsent: boolean;
};

export type DeliverableWebsiteLead = WebsiteLeadSubmission & {
  consentRecordedAt: string;
};

export interface WebsiteLeadDelivery {
  deliver(input: DeliverableWebsiteLead, idempotencyKey: string): Promise<void>;
}

export class SubmitWebsiteLeadService {
  constructor(private readonly delivery: WebsiteLeadDelivery, private readonly clock: Clock) {}

  async execute(input: WebsiteLeadSubmission, idempotencyKey: string) {
    const consentRecordedAt = this.clock.now().toISOString();
    await this.delivery.deliver({ ...input, consentRecordedAt }, idempotencyKey);
    return { acceptedAt: consentRecordedAt };
  }
}
