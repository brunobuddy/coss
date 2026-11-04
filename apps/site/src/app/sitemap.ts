import type { MetadataRoute } from "next";
import { CALENDAR } from "@/lib/calendar";
import { CHECKED, COMPETITORS } from "@/lib/calendar/compare";
import { TOOLS } from "@/lib/calendar/tools";
import { calendarSource } from "@/lib/calendar-docs";
import { CHANGELOG, CHANGELOG_ROUTE } from "@/lib/changelog";
import { COMPARE_ROUTE, COMPETITORS as COSS_COMPETITORS } from "@/lib/compare";
import { contentDate } from "@/lib/content-dates";
import { legalSource } from "@/lib/legal";
import { PRODUCTS_ROUTE, productPages, SOLUTIONS_ROUTE, solutionPages } from "@/lib/marketing";
import { SHIPYARD } from "@/lib/shipyard";
import { shipyardSource } from "@/lib/shipyard-docs";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";
import { FREE_TOOLS, TOOLS_ROUTE } from "@/lib/tools";

/** A page from a content folder, dated when the build knows when its file last changed. */
function contentEntry(folder: string, page: { url: string; path: string }) {
  const lastModified = contentDate(`content/${folder}/${page.path}`);
  return { url: `${SITE_URL}${page.url}`, ...(lastModified ? { lastModified } : {}) };
}

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL },
    { url: `${SITE_URL}/pricing` },
    { url: `${SITE_URL}/about` },
    { url: `${SITE_URL}${CHANGELOG_ROUTE}`, lastModified: CHANGELOG[0]?.date },
    { url: `${SITE_URL}${TOOLS_ROUTE}` },
    ...FREE_TOOLS.map((tool) => ({ url: `${SITE_URL}${TOOLS_ROUTE}/${tool.slug}` })),
    { url: `${SITE_URL}${PRODUCTS_ROUTE}` },
    ...productPages().map((page) => contentEntry("products", page)),
    { url: `${SITE_URL}${SOLUTIONS_ROUTE}` },
    ...solutionPages().map((page) => contentEntry("solutions", page)),
    { url: `${SITE_URL}${COMPARE_ROUTE}` },
    ...COSS_COMPETITORS.map((c) => ({
      url: `${SITE_URL}${COMPARE_ROUTE}/${c.slug}`,
      lastModified: c.checked,
    })),
    { url: `${SITE_URL}${SHIPYARD.path}` },
    ...shipyardSource.getPages().map((page) => contentEntry("shipyard", page)),
    { url: `${SITE_URL}${CALENDAR.path}` },
    { url: `${SITE_URL}${CALENDAR.demo}` },
    { url: `${SITE_URL}${CALENDAR.tools}` },
    ...TOOLS.map((tool) => ({ url: `${SITE_URL}${CALENDAR.tools}/${tool.slug}` })),
    { url: `${SITE_URL}${CALENDAR.compare}` },
    ...COMPETITORS.map((c) => ({
      url: `${SITE_URL}${CALENDAR.compare}/${c.slug}`,
      lastModified: CHECKED,
    })),
    ...calendarSource.getPages().map((page) => contentEntry("calendar", page)),
    ...source
      .getPages()
      .map((page) =>
        page.type === "openapi" ? { url: `${SITE_URL}${page.url}` } : contentEntry("docs", page),
      ),
    { url: `${SITE_URL}/legal` },
    ...legalSource.getPages().map((page) => ({
      url: `${SITE_URL}${page.url}`,
      lastModified: page.data.lastUpdated,
    })),
  ];
}
