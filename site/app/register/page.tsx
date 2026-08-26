import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireRuntimeIdentity } from "@/app/identity-runtime";
import { D1CustomerIdentityRepository } from "@/modules/customer/infrastructure/d1-customer-repositories";
import { registerCustomerAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const identity = await requireRuntimeIdentity("/register");
  const identities = new D1CustomerIdentityRepository(await getDb());
  if (await identities.findByProviderSubject(identity.provider, identity.externalSubject)) redirect("/account");
  return <section className="section"><div className="container narrow"><span className="eyebrow">Customer registration</span><h1>Create your Zuno Pixel account</h1><p>Your verified sign-in email is <strong>{identity.email.value}</strong>. Business details remain separate from your identity-provider account.</p><form action={registerCustomerAction} className="contact-form"><label>Customer reference<input name="externalReference" required maxLength={120} /></label><label>Business name<input name="businessName" required maxLength={200} /></label><label>Contact name<input name="contactName" required maxLength={200} defaultValue={identity.displayName} /></label><label>Phone<input name="phone" maxLength={50} /></label><label>Website<input name="websiteUrl" type="url" maxLength={500} /></label><label>Industry<input name="industry" maxLength={120} /></label><label>State<input name="state" maxLength={80} /></label><label>Postcode<input name="postcode" maxLength={12} /></label><button className="button" type="submit">Create account</button></form></div></section>;
}
