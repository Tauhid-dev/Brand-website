import type { MetadataRoute } from "next";
import { allRoutes, brand } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return allRoutes.map((path) => ({ url: new URL(path, brand.domain).toString(), changeFrequency: path === "/" ? "weekly" : "monthly", priority: path === "/" ? 1 : 0.7 }));
}
