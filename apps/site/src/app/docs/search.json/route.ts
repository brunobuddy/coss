import { docsSearch } from "@/lib/source";

// Indexes MDX pages and API operations alike (both carry structured data). Served under /docs
// (SEARCH_API, see the root layout) so coss.com's /api stays the dashboard's.
export const { GET } = docsSearch;
