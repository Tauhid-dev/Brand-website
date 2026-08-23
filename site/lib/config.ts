export type NavItem = { label: string; href: string };
export type Service = NavItem & {
  eyebrow: string;
  summary: string;
  outcomes: string[];
  icon: string;
};
export type Industry = NavItem & { summary: string; opportunity: string };
export type Package = {
  id: "essential" | "growth" | "leader";
  name: string;
  setup: number;
  monthly: number;
  popular?: boolean;
  description: string;
  features: string[];
  exclusions?: string[];
};

export type CurrencyCode = "AUD";
export type CountryCode = "AU";
export type SocialLink = {
  platform: "linkedin" | "instagram" | "facebook";
  url: string;
};
export interface BrandConfiguration {
  name: string;
  shortName: string;
  legalName: string;
  abn: string;
  tagline: string;
  description: string;
  domain: string;
  country: CountryCode;
  region: string;
  serviceRegion: string;
  supportEmail: string;
  salesEmail: string;
  phone: string;
  currency: CurrencyCode;
  gstEnabled: boolean;
  gst: string;
  logo: { mark: string; wordmark: string };
  socialLinks: readonly SocialLink[];
  analytics: { ga4MeasurementId: string };
  cta: { primary: NavItem; secondary: NavItem };
  seo: { title: string; description: string };
}

export const brand = {
  name: "Zuno Pixel",
  shortName: "Zuno Pixel",
  legalName: "Legal entity to be configured",
  abn: "ABN to be configured",
  tagline: "Get found. Build trust. Book more work.",
  description:
    "The complete local-business growth system that turns searches and enquiries into booked customers.",
  domain: "https://www.example.com",
  country: "AU",
  region: "Australia",
  serviceRegion: "Australian local businesses",
  supportEmail: "support@example.com",
  salesEmail: "hello@example.com",
  phone: "1300 000 000",
  currency: "AUD",
  gstEnabled: true,
  gst: "All prices are in Australian dollars and exclude GST.",
  logo: { mark: "/favicon.svg", wordmark: "/favicon.svg" },
  socialLinks: [
    { platform: "linkedin", url: "" },
    { platform: "instagram", url: "" },
    { platform: "facebook", url: "" },
  ],
  analytics: {
    ga4MeasurementId: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "",
  },
  cta: {
    primary: { label: "Get Your Free Growth Audit", href: "/growth-audit" },
    secondary: {
      label: "See the AI Receptionist in Action",
      href: "/ai-receptionist#demo",
    },
  },
  seo: {
    title: "Zuno Pixel | Local Business Growth System Australia",
    description:
      "Websites, local SEO, reputation, social presence and a 24/7 AI receptionist—managed as one growth system for Australian local businesses.",
  },
} as const satisfies BrandConfiguration;

export const services: Service[] = [
  {
    label: "Website Design",
    href: "/website-design",
    eyebrow: "Convert attention",
    icon: "01",
    summary: "Fast, credible websites shaped around real local buying decisions.",
    outcomes: ["Clear service journeys", "Mobile-first enquiries", "Hosting and ongoing care"],
  },
  {
    label: "Local SEO & Google",
    href: "/local-seo",
    eyebrow: "Get discovered",
    icon: "02",
    summary: "A stronger, more consistent presence across local search and Google.",
    outcomes: ["Google profile optimisation", "Local search foundations", "Useful performance reporting"],
  },
  {
    label: "Reputation Management",
    href: "/reputation-management",
    eyebrow: "Build confidence",
    icon: "03",
    summary: "Ethical systems for requesting, responding to and showcasing genuine feedback.",
    outcomes: ["Consistent review requests", "Professional responses", "No gating or fake reviews"],
  },
  {
    label: "Social Presence",
    href: "/social-presence",
    eyebrow: "Stay visible",
    icon: "04",
    summary: "One consistent campaign, adapted for the channels your customers actually use.",
    outcomes: ["Audience-led channel choice", "Approval-ready content", "Consistent brand profiles"],
  },
  {
    label: "AI Receptionist",
    href: "/ai-receptionist",
    eyebrow: "Respond instantly",
    icon: "05",
    summary: "A 24/7 website receptionist that answers, qualifies, captures and hands over.",
    outcomes: ["Approved business knowledge", "Structured lead capture", "Human handover"],
  },
  {
    label: "WhatsApp & Booking",
    href: "/whatsapp-booking",
    eyebrow: "Book the next step",
    icon: "06",
    summary: "Move qualified enquiries into WhatsApp or available Google Calendar appointments.",
    outcomes: ["Calendar availability", "Booking confirmation", "Clear usage disclosures"],
  },
];

export const industries: Industry[] = [
  ["Electricians", "electricians", "Turn urgent and planned electrical searches into structured enquiries.", "Capture suburb, job type and urgency before handover."],
  ["Plumbers", "plumbers", "Respond quickly when customers are comparing local plumbers.", "Separate emergencies from routine bookings."],
  ["Cleaning Businesses", "cleaning-businesses", "Build trust for recurring and one-off cleaning work.", "Qualify property type, frequency and location."],
  ["Landscapers", "landscapers", "Show capability clearly and capture project-fit information.", "Collect service, suburb, timing and project scope."],
  ["Builders & Handymen", "builders-handymen", "Give prospects a clear path from research to consultation.", "Triage job size and service type before follow-up."],
  ["Pest Control", "pest-control", "Support urgent searches with calm, immediate answers.", "Capture pest type, property and preferred time."],
  ["Automotive Services", "automotive-services", "Make service enquiries and booking requests easier.", "Collect vehicle, service need and availability."],
  ["Beauty Salons", "beauty-salons", "Create a polished local presence and reduce booking friction.", "Guide customers to the right service and appointment."],
].map(([label, slug, summary, opportunity]) => ({
  label,
  href: `/industries/${slug}`,
  summary,
  opportunity,
}));

export const packages: Package[] = [
  {
    id: "essential",
    name: "Essential Presence",
    setup: 1490,
    monthly: 249,
    description: "A credible, managed foundation for businesses ready to look established online.",
    features: [
      "Up to five website pages", "Mobile-first design", "Contact and quote forms",
      "Click-to-call and click-to-WhatsApp", "Core technical SEO, metadata and sitemap",
      "Analytics and Search Console setup", "Google Business Profile audit and optimisation",
      "Review link and QR-code setup", "Three priority profile or channel setups",
      "Secure hosting, SSL, backups and monitoring", "Security maintenance",
      "30 minutes of monthly content changes", "One Google Business Profile post per month",
      "Monthly performance summary", "Central web-enquiry inbox",
    ],
    exclusions: ["AI receptionist", "Weekly social management", "Advanced ongoing SEO"],
  },
  {
    id: "growth",
    name: "Growth Engine",
    setup: 2990,
    monthly: 649,
    popular: true,
    description: "The connected growth system for businesses ready to capture and book more demand.",
    features: [
      "Everything in Essential", "Up to eight core pages", "Three targeted initial service-area pages",
      "Local keyword and competitor research", "Enhanced on-page SEO",
      "Local Business, Service and FAQ schema", "Monthly technical SEO checks",
      "Two Google Business Profile posts per month", "Ethical review-request workflow",
      "Review-response assistance and showcase", "Directory consistency audit",
      "Four social posts per month across up to four selected channels", "Monthly content calendar",
      "Website AI receptionist and knowledge-base setup", "Lead capture",
      "Google Calendar appointment booking", "Business-hours behaviour and human handover",
      "Email lead notifications and conversation reporting", "Up to 500 AI conversations per month",
      "One hour of monthly content changes",
    ],
  },
  {
    id: "leader",
    name: "Market Leader",
    setup: 5490,
    monthly: 1290,
    description: "A deeper acquisition and conversion program for ambitious local operators.",
    features: [
      "Everything in Growth Engine", "Up to twelve core pages", "Eight initial service-area pages",
      "Advanced local SEO architecture", "Two monthly SEO content or landing-page improvements",
      "Competitor monitoring", "Citation and directory management", "Weekly Google profile posts",
      "Active profile, service, photo and Q&A management", "Managed review-request campaigns",
      "Review-response management and customer-recovery workflow",
      "Eight social content pieces across up to six selected channels",
      "Website and WhatsApp AI receptionist", "Booking, rescheduling, qualification and routing",
      "Follow-up for incomplete enquiries", "Human handover", "Up to 2,000 AI conversations per month",
      "Standard CRM/integration allowance", "Conversion reporting", "Quarterly strategy review",
      "Two hours of monthly content changes", "Priority support",
    ],
  },
];

export const addOns = [
  ["Additional standard page", "A$190 once-off"],
  ["Additional SEO service-area page", "A$290 once-off"],
  ["Additional managed location", "from A$249/month"],
  ["Additional 500 AI conversations", "A$79/month"],
  ["Additional social channel", "A$69/month"],
  ["Four additional monthly social posts", "A$249/month"],
  ["SEO article", "from A$290"],
  ["Google Ads management", "from A$399/month, excluding ad spend"],
  ["Meta Ads management", "from A$399/month, excluding ad spend"],
  ["Email or SMS follow-up automation", "from A$149/month"],
  ["Logo and basic identity package", "from A$690"],
  ["Additional WhatsApp number", "from A$99/month plus usage"],
  ["Advanced integrations", "Custom quote"],
] as const;

export const primaryNav: NavItem[] = [
  { label: "Services", href: "/#services" },
  { label: "Industries", href: "/industries" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
];

export const faqs = [
  ["Who owns the website?", "You own the approved website content and agreed deliverables. Hosting, licensing and transfer details are confirmed in your service agreement."],
  ["How does a typical launch work?", "We audit, agree scope, build and connect the system, launch after approval, then improve it using real performance data."],
  ["Do you guarantee Google rankings?", "No. No provider can ethically guarantee a search position. We improve the signals, content and consistency that support stronger local visibility."],
  ["How does the AI learn about my business?", "We configure it from information you approve—services, areas, hours, policies and escalation rules—then test it before launch."],
  ["Can a person take over?", "Yes. Handover rules can route a conversation or structured lead to your team when human judgement is needed."],
  ["Are WhatsApp fees included?", "WhatsApp Business Platform and messaging charges may be passed through separately. We confirm applicable costs before launch."],
  ["Does it connect with Google Calendar?", "Growth Engine and Market Leader include Google Calendar appointment booking, subject to configuration and calendar suitability."],
  ["How is visitor data handled?", "We minimise collection, use it to respond and route leads, and configure retention and integrations with you. See our AI and Data Usage Policy."],
  ["Can I change packages or cancel?", "Package changes and cancellation terms are confirmed in your agreement. We will explain any technical transition before it occurs."],
  ["Is GST included?", "No. Published prices are in Australian dollars and exclude GST."],
  ["Is advertising spend included?", "No. Media spend is paid separately, and management is available as an add-on."],
  ["Who approves social content?", "We agree a practical approval workflow with your team before recurring content begins."],
  ["Is review management policy-compliant?", "Our approach centres on genuine feedback, no positive-review incentives, no fake reviews and no selective review gating."],
];

export const pricingDisclosures = [
  brand.gst,
  "Setup and inclusions depend on confirmed scope.",
  "Advertising spend is not included.",
  "Domain registration, paid directory fees, premium assets and third-party services may be billed separately.",
  "WhatsApp Business Platform and messaging charges may be passed through separately.",
  "AI conversation allowances are subject to fair-use and package limits.",
  "Additional work requires approval before billing.",
  "No search-ranking position is guaranteed.",
];

export const allRoutes = [
  "/", ...services.map((item) => item.href), "/pricing", "/industries",
  ...industries.map((item) => item.href), "/about", "/growth-audit", "/contact",
  "/privacy", "/terms", "/ai-data-policy",
];
