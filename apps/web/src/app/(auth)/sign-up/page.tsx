import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { publicPageMetadata } from "@/lib/public-metadata";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/social";
import { socialErrorMessage } from "@/lib/social-errors";
import { SignUpForm } from "./sign-up-form";

export function generateMetadata(): Metadata {
  return publicPageMetadata({
    origin: env.BETTER_AUTH_URL,
    path: "/sign-up",
    title: "Sign up",
    description:
      "Create a free coss.com account: one API key and one SDK for email, SMS, scheduling and more.",
  });
}

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);
  return (
    <SignUpForm
      initialError={socialErrorMessage(typeof params.error === "string" ? params.error : null)}
      next={next}
      providers={enabledSocialProviders()}
      turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? null}
    />
  );
}
