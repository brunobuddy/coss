import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { publicPageMetadata } from "@/lib/public-metadata";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getSession } from "@/lib/session";
import { enabledSocialProviders } from "@/lib/social";
import { socialErrorMessage } from "@/lib/social-errors";
import { SignInForm } from "./sign-in-form";

export function generateMetadata(): Metadata {
  return publicPageMetadata({
    origin: env.BETTER_AUTH_URL,
    path: "/sign-in",
    title: "Sign in",
    description: "Sign in to your coss.com account to manage API keys, domains, logs and billing.",
  });
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getSession()) redirect(next);
  return (
    <SignInForm
      initialError={socialErrorMessage(typeof params.error === "string" ? params.error : null)}
      // Set by @coss/auth's `socialTwoFactor` after a Google or GitHub sign-in.
      initialStep={params.step === "two-factor" ? "two-factor" : "credentials"}
      next={next}
      providers={enabledSocialProviders()}
      turnstileSiteKey={env.TURNSTILE_SITE_KEY ?? null}
    />
  );
}
