import { changelogRss } from "@/lib/changelog";

export const revalidate = false;

export function GET() {
  return new Response(changelogRss(), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
