import { AuditForm, AiDemo, FAQList } from "@/components/Interactive";
import { Breadcrumbs } from "@/components/SiteChrome";
import { CtaBand, IndustryCard, PricingSection, SectionHeading, ServiceCard } from "@/components/Sections";
import { brand, faqs, industries, services } from "@/lib/config";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

type PageProps = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const path = `/${slug.join("/")}`;
  const service = services.find((item) => item.href === path);
  if (service) return pageMetadata(service.label, service.summary, path);
  const industry = industries.find((item) => item.href === path);
  if (industry) return pageMetadata(`${industry.label} Marketing`, industry.summary, path);
  const titles: Record<string, [string, string]> = {
    pricing: ["Pricing", "Clear packages for websites, local growth, AI receptionist and ongoing marketing."],
    industries: ["Industries", "Connected local growth systems for Australian trades and service businesses."],
    about: ["About", brand.description],
    "growth-audit": ["Free Growth Audit", "Find the gaps between local search, trust, enquiry response and booking."],
    contact: ["Contact", `Start a useful growth conversation with ${brand.name}.`],
    privacy: ["Privacy Policy", "How personal information is handled on this website and in configured services."],
    terms: ["Terms of Service", "Important terms and limitations for this website and proposed services."],
    "ai-data-policy": ["AI & Data Usage Policy", "How approved business knowledge and visitor lead information may be used."],
  };
  const current = titles[slug[0]];
  return current ? pageMetadata(current[0], current[1], path) : {};
}

const legalContent: Record<string, { title: string; updated: string; sections: [string, string][] }> = {
  privacy: {
    title: "Privacy Policy",
    updated: "Draft for professional legal review before launch",
    sections: [
      ["Our approach", "We aim to collect only the information needed to respond to enquiries, deliver agreed services and operate the website. We do not sell personal information without a lawful basis."],
      ["Information we may collect", "Contact details, business information, enquiry details, consent choices and limited technical information may be collected when you contact us or use a configured service."],
      ["How information is used", "Information may be used to respond, qualify a request, arrange a consultation, provide services, protect the website and meet legal obligations."],
      ["Service providers and storage", "Approved hosting, communications, analytics, calendar and CRM providers may process limited information under configured agreements. Final providers and retention periods must be confirmed before launch."],
      ["Your choices", "You may ask about access, correction or deletion where applicable, or withdraw optional marketing consent."],
      ["Contact", brand.supportEmail ? `Privacy enquiries can be directed to ${brand.supportEmail}.` : "Privacy enquiries can be submitted through the contact page once secure online delivery is configured."],
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "Draft for professional legal review before launch",
    sections: [
      ["Website information", "Public website content is general information and is not a binding proposal. Scope, fees, inclusions and responsibilities are confirmed in a signed service agreement."],
      ["Pricing", "Published prices are in Australian dollars and exclude GST. Third-party costs, advertising spend, domains, usage charges and custom work may be additional."],
      ["No ranking guarantee", "Search visibility depends on many factors outside our control. We do not guarantee a particular Google or search ranking."],
      ["AI limitations", "Automated assistants can misunderstand information. They require approved knowledge, testing, escalation rules and appropriate human oversight."],
      ["Intellectual property", "Ownership and licensing of customer content, deliverables, software and third-party materials are set out in the applicable agreement."],
      ["Contact", brand.supportEmail ? `Questions about these terms can be directed to ${brand.supportEmail}.` : "Questions about these terms can be submitted through the contact page once secure online delivery is configured."],
    ],
  },
  "ai-data-policy": {
    title: "AI & Data Usage Policy",
    updated: "Draft for professional legal review before launch",
    sections: [
      ["Business knowledge", "An individual business assistant may be configured from customer-approved information such as services, areas, hours, policies, pricing guidance and handover instructions."],
      ["Visitor information", "A configured assistant may collect a name, contact details, suburb, requested service, urgency and preferred appointment time when needed to respond and route a lead."],
      ["Why lead data is collected", "Lead information supports qualification, appointment booking, notifications, reporting and a useful human follow-up."],
      ["Human handover", "Customers define handover rules. Visitors should be offered a clear path to a person when judgement, complaints, sensitive matters or exceptions arise."],
      ["Integrations and retention", "Calendar, messaging, CRM and analytics providers may process limited data. Retention settings and account ownership are configured with each customer."],
      ["Limitations and safety", "The assistant is not an emergency service and should not provide medical, legal, financial or other high-risk professional advice. Emergency prompts should direct visitors to appropriate services."],
      ["Control and contact", brand.supportEmail ? `Customers retain control of approved knowledge and connected accounts under their agreement. Privacy enquiries can be sent to ${brand.supportEmail}.` : "Customers retain control of approved knowledge and connected accounts under their agreement. Privacy enquiries can be submitted through the contact page once secure online delivery is configured."],
    ],
  },
};

export default async function CatchAllPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const path = `/${slug.join("/")}`;
  const service = services.find((item) => item.href === path);
  if (service) return <ServicePage service={service} />;
  const industry = industries.find((item) => item.href === path);
  if (industry) return <IndustryPage industry={industry} />;
  if (path === "/pricing") return <PricingPage />;
  if (path === "/industries") return <IndustriesPage />;
  if (path === "/about") return <AboutPage />;
  if (path === "/growth-audit") return <AuditPage />;
  if (path === "/contact") return <ContactPage />;
  if (legalContent[slug[0]]) return <LegalPage data={legalContent[slug[0]]} />;
  notFound();
}

function PageHero({ eyebrow, title, copy, parent }: { eyebrow: string; title: string; copy: string; parent?: { label: string; href: string } }) {
  return <><Breadcrumbs items={[...(parent ? [parent] : []), { label: title }]} /><section className="page-hero"><div className="container narrow"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p><div className="cta-group"><a className="button" href="/growth-audit">Get Your Free Growth Audit</a><a className="text-button dark-text" href="/pricing">See pricing →</a></div></div></section></>;
}

function ServicePage({ service }: { service: (typeof services)[number] }) {
  const isAi = service.href === "/ai-receptionist";
  return <><PageHero eyebrow={service.eyebrow} title={service.label} copy={service.summary} /><section className="section"><div className="container split"><SectionHeading eyebrow="Connected by design" title="A service that strengthens the whole customer journey." copy="We do not bolt isolated tactics together. We design each capability around the moment before it and the outcome after it." /><div className="outcome-panel">{service.outcomes.map((outcome, index) => <div key={outcome}><span>0{index + 1}</span><strong>{outcome}</strong></div>)}</div></div></section>{isAi && <section id="demo" className="section dark-section demo-section"><div className="container"><SectionHeading eyebrow="Try the deterministic demo" title="Watch one enquiry become a structured lead." copy="This local demonstration uses fixed example data and never collects real personal information." /><AiDemo /></div></section>}<section className="section tinted"><div className="container"><SectionHeading eyebrow="What the engagement covers" title="Strategy, setup and ongoing improvement." align="center" /><div className="feature-cols"><div><strong>Audit</strong><p>Review the current customer journey, systems, information and gaps.</p></div><div><strong>Build</strong><p>Create the content, interfaces and rules required for this capability.</p></div><div><strong>Connect</strong><p>Link approved channels and make handovers visible to your team.</p></div><div><strong>Improve</strong><p>Use real enquiry and conversion signals to guide practical refinements.</p></div></div></div></section><CtaBand /></>;
}

function IndustriesPage() {
  return <><PageHero eyebrow="Industry growth systems" title="Built for the way local customers choose." copy="Useful industry pages should reflect real buying journeys—not repeat the same keywords with a different trade name." /><section className="section"><div className="container industry-grid">{industries.map(industry => <IndustryCard key={industry.href} industry={industry} />)}</div></section><CtaBand /></>;
}

function IndustryPage({ industry }: { industry: (typeof industries)[number] }) {
  return <><PageHero eyebrow="Local growth system" title={`Growth marketing for ${industry.label.toLowerCase()}`} copy={industry.summary} parent={{ label: "Industries", href: "/industries" }} /><section className="section"><div className="container split"><SectionHeading eyebrow="Where the system helps" title={industry.opportunity} copy="The right setup should answer the customer’s immediate questions, capture the details your team needs and make the next step obvious." /><div className="journey-list">{["A customer searches locally with a clear need", "Your website and Google presence establish fit and trust", "The AI receptionist captures useful job details", "An available consultation or service time is offered", "Your team receives a structured lead and clear handover"].map((item, i) => <div key={item}><span>{i + 1}</span><p>{item}</p></div>)}</div></div></section><section className="section tinted"><div className="container"><SectionHeading eyebrow="Recommended capabilities" title={`A connected foundation for ${industry.label.toLowerCase()}.`} align="center" /><div className="service-grid compact">{services.slice(0, 6).map(service => <ServiceCard key={service.href} service={service} />)}</div></div></section><CtaBand /></>;
}

function PricingPage() {
  return <><PageHero eyebrow="Transparent, configuration-driven pricing" title="Choose your growth system." copy="Three clear managed packages, plus flexible additions for different stages and operating models." /><section className="section pricing-page"><div className="container"><PricingSection full /></div></section><section className="section tinted"><div className="container narrow"><SectionHeading eyebrow="Common pricing questions" title="Know what is—and is not—included." /><FAQList items={faqs.filter((_, index) => [1, 2, 5, 8, 9, 10].includes(index))} /></div></section><CtaBand /></>;
}

function AboutPage() {
  return <><PageHero eyebrow="One system. One accountable partner." title="Local growth works better when the parts work together." copy={`${brand.name} exists to remove the gaps between being discovered, earning trust, answering an enquiry and booking the next step.`} /><section className="section"><div className="container split"><SectionHeading eyebrow="Our position" title="Not just a web agency. Not just a chatbot vendor." copy="We combine the essential digital touchpoints of a local business into a manageable growth system—then keep improving the path customers actually take." /><div className="principles"><div><span>01</span><h3>Clarity over hype</h3><p>Specific outcomes, honest limitations and understandable reporting.</p></div><div><span>02</span><h3>Human judgement stays</h3><p>Automation handles repeatable moments; people retain oversight and exceptions.</p></div><div><span>03</span><h3>Trust compounds</h3><p>Consistent information and genuine feedback matter more than shortcuts.</p></div></div></div></section><CtaBand /></>;
}

function AuditPage() {
  return <><Breadcrumbs items={[{ label: "Free Growth Audit" }]} /><section className="audit-page"><div className="container audit-layout"><div className="audit-copy"><span className="eyebrow light">Free local growth audit</span><h1>Find the gaps between search and booking.</h1><p>Tell us where your business is today. We’ll use the configured delivery process to review your website, Google presence, trust signals and enquiry journey.</p><ul className="check-list light-list"><li>No ranking guarantees or generic scorecard</li><li>No sensitive information requested</li><li>Clear, practical next-step recommendations</li></ul><div className="privacy-card"><span>01</span><p><strong>Your details stay out of analytics.</strong><br />Form contents are never included in tracking events.</p></div></div><div className="form-shell"><h2>Tell us about your business</h2><p>Fields marked by context are required for a useful response.</p><AuditForm /></div></div></section></>;
}

function ContactPage() {
  return <><PageHero eyebrow="Start a useful conversation" title="Tell us what growth looks like for your business." copy="Ask a question, request a consultation or start with the free growth audit." /><section className="section"><div className="container contact-grid"><div><SectionHeading eyebrow="Contact" title="A clear path to the right next step." />{brand.salesEmail && <div className="contact-method"><span>Email</span><a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a></div>}{brand.phone && <div className="contact-method"><span>Phone</span><a href={`tel:${brand.phone.replace(/\s/g, "")}`}>{brand.phone}</a></div>}{!brand.salesEmail && !brand.phone && <p>Use the secure enquiry form to start a conversation. Direct contact details are shown only when they have been verified and configured.</p>}</div><div className="form-shell compact-form"><AuditForm compact /></div></div></section></>;
}

function LegalPage({ data }: { data: (typeof legalContent)[string] }) {
  return <><Breadcrumbs items={[{ label: data.title }]} /><article className="legal-page container narrow"><span className="eyebrow">Legal and trust</span><h1>{data.title}</h1><p className="legal-status">{data.updated}</p>{data.sections.map(([heading, copy]) => <section key={heading}><h2>{heading}</h2><p>{copy}</p></section>)}</article></>;
}
