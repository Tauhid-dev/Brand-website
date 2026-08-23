import type { Metadata } from "next";
import { brand } from "./config";

export function pageMetadata(title: string, description: string, path = "/"): Metadata {
  const url = new URL(path, brand.domain).toString();
  return {
    title: `${title} | ${brand.name}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: brand.name, locale: "en_AU", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function organisationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: brand.name,
    description: brand.description,
    areaServed: brand.region,
    url: brand.domain,
    email: brand.salesEmail,
    telephone: brand.phone,
  };
}
