import { addOns, brand, Industry, Package, packages, pricingDisclosures, Service } from "@/lib/config";

export function SectionHeading({ eyebrow, title, copy, align = "left" }: { eyebrow: string; title: string; copy?: string; align?: "left" | "center" }) {
  return <div className={`section-heading ${align}`}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>;
}

export function CtaBand() {
  return <section className="cta-band"><div className="container"><div><span className="eyebrow">Your next customer is already searching</span><h2>Ready to turn more local searches into customers?</h2></div><a className="button light" href={brand.cta.primary.href}>{brand.cta.primary.label}<span aria-hidden="true">↗</span></a></div></section>;
}

export function ServiceCard({ service }: { service: Service }) {
  return <a className="service-card" href={service.href}><span className="card-number">{service.icon}</span><span className="eyebrow">{service.eyebrow}</span><h3>{service.label}</h3><p>{service.summary}</p><span className="text-link">Explore service <span aria-hidden="true">↗</span></span></a>;
}

export function IndustryCard({ industry }: { industry: Industry }) {
  return <a className="industry-card" href={industry.href}><span className="industry-icon" aria-hidden="true">↗</span><h3>{industry.label}</h3><p>{industry.summary}</p><span className="text-link">Growth system for {industry.label.toLowerCase()} →</span></a>;
}

export function PricingCard({ item }: { item: Package }) {
  return <article className={`pricing-card ${item.popular ? "popular" : ""}`} id={item.id}>{item.popular && <span className="popular-label">Most Popular</span>}<p className="plan-label">0{packages.indexOf(item) + 1} · {item.name}</p><p className="plan-copy">{item.description}</p><div className="price-row"><div><small>Setup</small><strong>A${item.setup.toLocaleString("en-AU")}</strong></div><div><small>Ongoing</small><strong>A${item.monthly.toLocaleString("en-AU")}<em>/mo</em></strong></div></div><a className={`button ${item.popular ? "" : "secondary"}`} href={`/growth-audit?plan=${item.id}`}>Choose {item.name}</a><ul>{item.features.slice(0, 9).map(feature => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul><details><summary>View all inclusions</summary><ul>{item.features.slice(9).map(feature => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>{item.exclusions && <p className="exclusions"><strong>Not included:</strong> {item.exclusions.join(", ")}.</p>}</details></article>;
}

export function PricingSection({ full = false }: { full?: boolean }) {
  return <><div className="pricing-grid">{packages.map(item => <PricingCard key={item.id} item={item} />)}</div>{full && <><div className="custom-plan"><div><span className="eyebrow">Custom multi-location</span><h3>From A$2,490/month <small>plus implementation</small></h3></div><p>For franchises, multiple locations, multiple calendars, custom integrations and high-volume requirements.</p><a className="button secondary" href="/contact">Discuss your requirements</a></div><section className="addons"><SectionHeading eyebrow="Flexible additions" title="Add what your growth system needs." /><div className="addon-list">{addOns.map(([name, price]) => <div key={name}><span>{name}</span><strong>{price}</strong></div>)}</div></section><div className="disclosures"><strong>Important pricing details</strong><ul>{pricingDisclosures.map(item => <li key={item}>{item}</li>)}</ul></div></>}</>;
}
