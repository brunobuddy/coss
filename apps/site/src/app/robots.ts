import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The site owns coss.com's root files (ZONE_ROUTES in @coss/auth/slugs), so this also speaks for
// the zones on other apps: their sitemaps are listed here, and the dashboard's pages keep crawlers
// out with a sign-in redirect and noindex (apps/web/src/lib/public-metadata.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/docs/search.json",
        "/shipyard/docs/search.json",
        "/kloq/docs/search.json",
      ],
    },
    sitemap: ["/sitemap.xml", "/ui/sitemap.xml", "/origin/sitemap.xml", "/qnot/sitemap.xml"].map(
      (path) => `${SITE_URL}${path}`,
    ),
  };
}
