import { brand, industries, primaryNav, services } from "@/lib/config";
import { MobileNav } from "./Interactive";

export function Logo() {
  return <a className="logo" href="/" aria-label={`${brand.name} home`}><span className="logo-mark" aria-hidden="true"><i /><i /><i /></span><span>{brand.name}</span></a>;
}

export function SiteHeader() {
  return <header className="site-header"><div className="container header-inner"><Logo /><nav className="desktop-nav" aria-label="Primary navigation">{primaryNav.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}<a className="button small" href={brand.cta.primary.href}>Free Growth Audit</a></nav><MobileNav /></div></header>;
}

export function SiteFooter() {
  const groups = [
    ["Services", services],
    ["Industries", industries.slice(0, 5)],
    ["Company", [{ label: "About", href: "/about" }, { label: "Pricing", href: "/pricing" }, { label: "Contact", href: "/contact" }, { label: "Growth Audit", href: "/growth-audit" }]],
    ["Legal", [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "AI & Data Policy", href: "/ai-data-policy" }]],
  ] as const;
  return <footer className="site-footer"><div className="container footer-top"><div className="footer-brand"><Logo /><p>{brand.description}</p><p>Built for {brand.serviceRegion}.</p><a href={`mailto:${brand.salesEmail}`}>{brand.salesEmail}</a><a href={`tel:${brand.phone.replace(/\s/g, "")}`}>{brand.phone}</a></div>{groups.map(([title, links]) => <nav key={title} aria-label={`${title} links`}><strong>{title}</strong>{links.map(item => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>)}</div><div className="container footer-bottom"><span>© {new Date().getFullYear()} {brand.name}. {brand.legalName}. {brand.abn}.</span><span>Australia · Prices exclude GST</span></div></footer>;
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return <nav className="breadcrumbs container" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li>{items.map((item) => <li key={item.label}>{item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}</li>)}</ol></nav>;
}

export function StructuredData({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
