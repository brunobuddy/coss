"use client";

import { DEVICE_TOKEN_HEADER, type SocialProvider } from "@coss/auth/constants";
import { rememberFirstTouch } from "@coss/auth/first-touch";
import { Button } from "@coss/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@coss/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Separator } from "@coss/ui/components/separator";
import { collectDevice } from "coss/device";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { SocialSignInButtons } from "@/components/social-sign-in";
import { useTurnstile } from "@/components/turnstile";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { nextQuery } from "@/lib/safe-redirect";

export function SignUpForm({
  next,
  turnstileSiteKey,
  providers,
  initialError,
}: {
  next: string;
  turnstileSiteKey: string | null;
  /** Social sign-in providers configured for this deployment. */
  providers: SocialProvider[];
  /** A failed Google or GitHub sign-up, from `?error=` (`socialErrorMessage`). */
  initialError: string | null;
}) {
  const turnstile = useTurnstile(turnstileSiteKey, "sign-up");
  // For visitors whose first page is this one; the site's pages do the same for the rest.
  useEffect(() => {
    rememberFirstTouch();
  }, []);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    // `callbackURL` is where the emailed verification link lands after verifying.
    const email = String(form.get("email") ?? "");
    const { error } = await authClient.signUp.email({
      name: String(form.get("name") ?? "").trim(),
      email,
      password: String(form.get("password") ?? ""),
      callbackURL: next,
      // coss.com Risk recognizes the browser across sign-ups (`coss/device`, our own SDK).
      fetchOptions: { headers: { ...turnstile.headers, [DEVICE_TOKEN_HEADER]: collectDevice() } },
    });
    turnstile.reset();
    if (error) {
      setError(authErrorMessage(error, "Could not create the account."));
      setPending(false);
      return;
    }
    setCreatedEmail(email);
    setPending(false);
  }

  const query = nextQuery(next);

  if (createdEmail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle render={<h1>Check your email</h1>} />
          <CardDescription>
            We sent a verification link to {createdEmail}. Verify your address before signing in and
            creating an organization.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <Button render={<Link href={`/sign-in${query}`} />}>Continue to sign in</Button>
        </CardPanel>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h1>Create your coss.com account</h1>} />
        <CardDescription>Verify your email before creating your organization.</CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        {/* method="post": a submit before hydration must never put credentials in the URL. */}
        <form className="flex flex-col gap-4" method="post" onSubmit={onSubmit}>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input autoComplete="name" name="name" required />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input autoComplete="email" name="email" required type="email" />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              autoComplete="new-password"
              maxLength={128}
              minLength={8}
              name="password"
              required
              type="password"
            />
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          {turnstile.widget}
          <FormError message={error ?? turnstile.error} />
          <Button disabled={!turnstile.ready} loading={pending} type="submit">
            Create account
          </Button>
        </form>
        {providers.length > 0 ? (
          <>
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
            <SocialSignInButtons
              disabled={pending}
              errorPath={`/sign-up${query}`}
              next={next}
              onError={setError}
              providers={providers}
            />
          </>
        ) : null}
        {/* Plain links: /legal is the site's (another zone; next.config.ts redirects in dev). */}
        <p className="text-center text-muted-foreground text-xs">
          By creating an account, you agree to the{" "}
          <a className="text-foreground underline" href="/legal/terms">
            Terms of Service
          </a>{" "}
          and{" "}
          <a className="text-foreground underline" href="/legal/privacy">
            Privacy Policy
          </a>
          .
        </p>
        <p className="text-center text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link className="text-foreground underline" href={`/sign-in${query}`}>
            Sign in
          </Link>
        </p>
      </CardPanel>
    </Card>
  );
}
