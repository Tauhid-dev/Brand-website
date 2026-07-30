import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { brand } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(brand.domain),
  title: { default: brand.seo.title, template: `%s | ${brand.name}` },
  description: brand.seo.description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title: brand.seo.title, description: brand.seo.description, type: "website", locale: "en_AU", siteName: brand.name, images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: brand.seo.title, description: brand.seo.description, images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body><a className="skip-link" href="#main-content">Skip to content</a><SiteHeader /><main id="main-content">{children}</main><SiteFooter /></body></html>;
}
