"use client";

import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "@coss/auth/constants";
import { Button } from "@coss/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@coss/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Separator } from "@coss/ui/components/separator";
import { BuildingIcon, KeyRoundIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { FormError } from "@/components/form-error";
import { SocialSignInButtons } from "@/components/social-sign-in";
import { type Turnstile, useTurnstile } from "@/components/turnstile";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { nextQuery } from "@/lib/safe-redirect";

/** Codes that end the two-factor challenge: the user has to enter their password again. */
const CHALLENGE_OVER = new Set(["INVALID_TWO_FACTOR_COOKIE", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"]);

export type SignInStep = "credentials" | "two-factor";

export function SignInForm({
  next,
  turnstileSiteKey,
  providers,
  initialStep,
  initialError,
}: {
  next: string;
  turnstileSiteKey: string | null;
  /** Social sign-in providers configured for this deployment. */
  providers: SocialProvider[];
  /** `two-factor` when a Google or GitHub sign-in left a challenge cookie (`?step=`). */
  initialStep: SignInStep;
  /** A failed Google or GitHub sign-in, from `?error=` (`socialErrorMessage`). */
  initialError: string | null;
}) {
  const [step, setStep] = useState<SignInStep>(initialStep);
  const [error, setError] = useState<string | null>(initialError);

  // Shown once: a reload shouldn't repeat an old error or reopen a finished challenge.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("error") && !url.searchParams.has("step")) return;
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("step");
    window.history.replaceState(null, "", url);
  }, []);

  // A full page load, so server components see the new session cookie. Stable, so the passkey
  // autofill request below isn't restarted on every render.
  const finish = useCallback(() => window.location.assign(next), [next]);

  return step === "credentials" ? (
    <CredentialsStep
      error={error}
      next={next}
      providers={providers}
      turnstileSiteKey={turnstileSiteKey}
      onError={setError}
      onSignedIn={finish}
      onTwoFactor={() => {
        setError(null);
        setStep("two-factor");
      }}
    />
  ) : (
    <TwoFactorStep
      onChallengeOver={(message) => {
        setError(message);
        setStep("credentials");
      }}
      onSignedIn={finish}
    />
  );
}

function CredentialsStep(props: {
  next: string;
  turnstileSiteKey: string | null;
  providers: SocialProvider[];
  error: string | null;
  onError: (message: string | null) => void;
  onSignedIn: () => void;
  onTwoFactor: () => void;
}) {
  const { onError, onSignedIn } = props;
  const [pending, setPending] = useState<"password" | "passkey" | "social" | null>(null);
  // Only the password form: passkey sign-ins need no token.
  const turnstile: Turnstile = useTurnstile(props.turnstileSiteKey, "sign-in");

  // Passkey autofill: browsers that support conditional mediation offer saved passkeys in the
  // email field's suggestions. The request stays open until one is picked (or it's aborted by
  // another WebAuthn call, e.g. the passkey button).
  useEffect(() => {
    let active = true;
    void (async () => {
      if (!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return;
      const { data } = await authClient.signIn.passkey({ autoFill: true });
      if (active && data) onSignedIn();
    })();
    return () => {
      active = false;
    };
  }, [onSignedIn]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("password");
    onError(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      fetchOptions: { headers: turnstile.headers },
    });
    turnstile.reset();
    if (error || !data) {
      onError(authErrorMessage(error, "Could not sign in."));
      setPending(null);
      return;
    }
    // Two-factor accounts get a challenge cookie instead of a session.
    if ("twoFactorRedirect" in data && data.twoFactorRedirect) {
      props.onTwoFactor();
      return;
    }
    onSignedIn();
  }

  async function signInWithPasskey() {
    setPending("passkey");
    onError(null);
    const { data, error } = await authClient.signIn.passkey();
    if (data) {
      onSignedIn();
      return;
    }
    onError(authErrorMessage(error, "Could not sign in with a passkey."));
    setPending(null);
  }

  const query = nextQuery(props.next);

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h1>Sign in to coss.com</h1>} />
        <CardDescription>
          Use your email and password
          {props.providers.map((provider) => `, ${SOCIAL_PROVIDER_LABELS[provider]}`).join("")}, a
          passkey or single sign-on.
        </CardDescription>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        {/* method="post": a submit before hydration must never put credentials in the URL. */}
        <form className="flex flex-col gap-4" method="post" onSubmit={onSubmit}>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input autoComplete="username webauthn" name="email" required type="email" />
          </Field>
          <Field>
            <div className="flex w-full items-center justify-between gap-2">
              <FieldLabel>Password</FieldLabel>
              <Link
                className="text-muted-foreground text-sm underline hover:text-foreground"
                href={`/forgot-password${query}`}
              >
                Forgot password?
              </Link>
            </div>
            <Input autoComplete="current-password" name="password" required type="password" />
          </Field>
          {turnstile.widget}
          <FormError message={props.error ?? turnstile.error} />
          <Button
            disabled={pending !== null || !turnstile.ready}
            loading={pending === "password"}
            type="submit"
          >
            Sign in
          </Button>
        </form>
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>
        <SocialSignInButtons
          disabled={pending !== null && pending !== "social"}
          errorPath={`/sign-in${query}`}
          next={props.next}
          onError={(message) => {
            onError(message);
            if (message) setPending(null);
          }}
          onStart={() => setPending("social")}
          providers={props.providers}
        />
        <Button
          disabled={pending !== null}
          loading={pending === "passkey"}
          onClick={signInWithPasskey}
          variant="outline"
        >
          <KeyRoundIcon />
          Sign in with a passkey
        </Button>
        <Button
          disabled={pending !== null}
          render={<Link href={`/sso${query}`} />}
          variant="outline"
        >
          <BuildingIcon />
          Sign in with SSO
        </Button>
        <p className="text-center text-muted-foreground text-sm">
          No account?{" "}
          <Link className="text-foreground underline" href={`/sign-up${query}`}>
            Sign up
          </Link>
        </p>
      </CardPanel>
    </Card>
  );
}

function TwoFactorStep(props: {
  onSignedIn: () => void;
  onChallengeOver: (message: string) => void;
}) {
  const [method, setMethod] = useState<"totp" | "backup-code">("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const { error } =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: code.replace(/\s+/g, "") })
        : await authClient.twoFactor.verifyBackupCode({ code });
    if (!error) {
      props.onSignedIn();
      return;
    }
    const message = authErrorMessage(error, "Could not verify the code.");
    if (error.code && CHALLENGE_OVER.has(error.code)) {
      props.onChallengeOver(message);
      return;
    }
    setError(message);
    setPending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h1>Two-factor authentication</h1>} />
        <CardDescription>
          {method === "totp"
            ? "Enter the 6-digit code from your authenticator app."
            : "Enter one of the backup codes you saved when you set up two-factor authentication."}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="flex flex-col gap-4" method="post" onSubmit={onSubmit}>
          {/* Keyed so switching methods clears the field. */}
          <Field key={method}>
            <FieldLabel>{method === "totp" ? "Authentication code" : "Backup code"}</FieldLabel>
            {method === "totp" ? (
              <Input
                autoComplete="one-time-code"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                name="code"
                pattern="[0-9]{6}"
                placeholder="123456"
                required
              />
            ) : (
              <Input
                autoComplete="off"
                autoFocus
                name="code"
                placeholder="xxxxx-xxxxx"
                required
                spellCheck={false}
              />
            )}
            {method === "backup-code" ? (
              <FieldDescription>Each backup code works once.</FieldDescription>
            ) : null}
          </Field>
          <FormError message={error} />
          <Button loading={pending} type="submit">
            Verify
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setError(null);
              setMethod(method === "totp" ? "backup-code" : "totp");
            }}
            size="sm"
            variant="ghost"
          >
            {method === "totp" ? "Use a backup code instead" : "Use your authenticator app instead"}
          </Button>
        </form>
      </CardPanel>
    </Card>
  );
}
