"use client";

import { useParams, usePathname } from "next/navigation";
import { PageHeader } from "@/components/page-header";

const TITLES: Record<string, string> = {
  "": "Settings",
  "/billing": "Billing",
  "/sso": "Single sign-on",
  "/scim": "Directory sync",
  "/audit": "Audit log",
  "/compliance": "Compliance",
};

/** The title of the settings pages that don't have their own header (Projects, Members, Spend do). */
export function SettingsTitle() {
  const pathname = usePathname();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const title = TITLES[pathname.slice(`/${orgSlug}/settings`.length)];
  return title ? <PageHeader title={title} /> : null;
}
