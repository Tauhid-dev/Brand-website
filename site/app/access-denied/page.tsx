import Link from "next/link";

export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  const label = area === "admin" ? "administration" : "this customer account";
  return <section className="section"><div className="container narrow portal-message"><span className="eyebrow">Access restricted</span><h1>We couldn&apos;t open {label}.</h1><p>Your signed-in ChatGPT identity is not linked to the required active Zuno Pixel profile. Contact your account administrator if you believe this is unexpected.</p><div className="cta-group"><Link className="button" href="/">Return to the website</Link><Link className="button secondary" href="/contact">Contact Zuno Pixel</Link></div></div></section>;
}
