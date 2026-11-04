import type { Metadata } from "next";

/**
 * A signed-out page search engines may list. Signed-out requests for any other path redirect to
 * `/sign-in?next=…`, so the canonical is what folds those variants into one URL.
 */
export function publicPageMetadata({
  origin,
  path,
  title,
  description,
}: {
  origin: string;
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: new URL(path, origin).toString() },
  };
}
