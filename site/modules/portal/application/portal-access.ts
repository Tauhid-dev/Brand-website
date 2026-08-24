import type { CustomerPrincipal } from "../../identity/domain/access-control.ts";
import type { PortalReadRepository } from "./ports.ts";

export class CustomerPortalQueryService {
  constructor(private readonly read: PortalReadRepository) {}

  async execute(principal: CustomerPrincipal) {
    return this.read.getCustomerAccount(principal.customerId);
  }
}
