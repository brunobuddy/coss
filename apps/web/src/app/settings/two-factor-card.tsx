"use client";

import { Alert, AlertDescription } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { LifeBuoyIcon, SmartphoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { QrCode } from "@/components/qr-code";
import { SettingsNote, SettingsRow, SettingsSection } from "@/components/settings";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { toast } from "@/lib/toast";

type Props = {
  enabled: boolean;
  /** Names of the user's organizations that require two-factor authentication. */
  requiredBy: string[];
  /** Why factors can't be changed in this session (impersonation), or `null`. */
  restriction: string | null;
  /** The account has no password yet (Google or GitHub only): enabling confirms with it. */
  needsPassword: boolean;
};

export function TwoFactorCard({ enabled, requiredBy, restriction, needsPassword }: Props) {
  return (
    <SettingsSection
      description="A 6-digit code from an app like 1Password, Google Authenticator or Authy, asked whenever you sign in with your password or a connected account."
      title="Two-factor authentication"
    >
      <SettingsRow
        description={
          enabled
            ? "Your sign-ins ask for a code from your app."
            : needsPassword
              ? "Set a password first: turning it on asks for it."
              : "Your password alone signs you in."
        }
        label={
          <>
            Authenticator app
            {enabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="outline">Off</Badge>
            )}
          </>
        }
      >
        {restriction ? null : enabled ? (
          <DisableDialog requiredBy={requiredBy} />
        ) : needsPassword ? null : (
          <SetupDialog />
        )}
      </SettingsRow>
      {enabled ? (
        <SettingsRow
          description="Each one signs you in once if you lose your authenticator. Create a new set if yours are gone."
          label="Backup codes"
        >
          {restriction ? null : <BackupCodesDialog />}
        </SettingsRow>
      ) : null}
      {restriction ? <SettingsNote>{restriction}</SettingsNote> : null}
    </SettingsSection>
  );
}

/** `secret=` of an otpauth:// URI (base32), for typing into an app that can't scan. */
function manualKey(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

function PasswordField() {
  return (
    <Field>
      <FieldLabel>Password</FieldLabel>
      <Input autoComplete="current-password" autoFocus name="password" required type="password" />
    </Field>
  );
}

function formPassword(event: FormEvent<HTMLFormElement>): string {
  return String(new FormData(event.currentTarget).get("password") ?? "");
}

/** Password → scan the QR code and confirm a code → save the backup codes. */
function SetupDialog() {
  const router = useRouter();
  return (
    <Dialog
      onOpenChange={(open) => {
        // Re-render the page (badge, banners) after a completed setup.
        if (!open) router.refresh();
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>Set up</DialogTrigger>
      <DialogPopup>
        {/* The popup unmounts when closed, which discards the secret and backup codes. */}
        <SetupFlow />
      </DialogPopup>
    </Dialog>
  );
}

function SetupFlow() {
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.enable({ password: formPassword(event) });
    setPending(false);
    if (error || !data || data.method !== "totp") {
      setError(authErrorMessage(error, "Could not start the setup."));
      return;
    }
    setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError(authErrorMessage(error, "Could not verify the code."));
      return;
    }
    toast.success("Two-factor authentication turned on");
    setVerified(true);
  }

  if (setup && verified) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={LifeBuoyIcon} />
          <DialogTitle>Save your backup codes</DialogTitle>
          <DialogDescription>
            Two-factor authentication is on. If you lose your authenticator, each of these codes
            signs you in once. Store them somewhere safe; they won't be shown again.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <BackupCodeList codes={setup.backupCodes} />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }

  if (setup) {
    return (
      <form className="contents" onSubmit={verify}>
        <DialogHeader>
          <DialogIcon icon={SmartphoneIcon} />
          <DialogTitle>Scan the QR code</DialogTitle>
          <DialogDescription>
            Scan it with your authenticator app, then enter the 6-digit code it shows.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col items-center gap-4">
          <QrCode label="Authenticator app QR code" value={setup.totpURI} />
          <div className="flex w-full flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Can't scan it? Enter this key instead:</span>
            <code className="select-all break-all rounded-lg border bg-muted px-3 py-2 font-mono">
              {manualKey(setup.totpURI)}
            </code>
          </div>
          <Field className="w-full">
            <FieldLabel>Authentication code</FieldLabel>
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
          </Field>
          <div className="w-full">
            <FormError message={error} />
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <Button loading={pending} type="submit">
            Turn on
          </Button>
        </DialogFooter>
      </form>
    );
  }

  return (
    <form className="contents" onSubmit={start}>
      <DialogHeader>
        <DialogIcon icon={SmartphoneIcon} />
        <DialogTitle>Set up an authenticator app</DialogTitle>
        <DialogDescription>Confirm your password to continue.</DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <PasswordField />
        <FormError message={error} />
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Continue
        </Button>
      </DialogFooter>
    </form>
  );
}

function BackupCodeList({ codes }: { codes: string[] }) {
  return (
    <>
      <ul className="grid select-all grid-cols-2 gap-x-6 gap-y-1 rounded-lg border bg-muted px-4 py-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div>
        <CopyButton label="Copy codes" value={codes.join("\n")} />
      </div>
    </>
  );
}

/** Replaces every backup code (the old ones stop working). */
function BackupCodesDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>New codes</DialogTrigger>
      <DialogPopup>
        <BackupCodesFlow />
      </DialogPopup>
    </Dialog>
  );
}

function BackupCodesFlow() {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({
      password: formPassword(event),
    });
    setPending(false);
    if (error || !data) {
      setError(authErrorMessage(error, "Could not create new backup codes."));
      return;
    }
    toast.success("Backup codes replaced");
    setCodes(data.backupCodes);
  }

  if (codes) {
    return (
      <>
        <DialogHeader>
          <DialogIcon icon={LifeBuoyIcon} />
          <DialogTitle>Your new backup codes</DialogTitle>
          <DialogDescription>
            Your previous codes no longer work. Store these somewhere safe; they won't be shown
            again.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="flex flex-col gap-3">
          <BackupCodeList codes={codes} />
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button />}>Done</DialogClose>
        </DialogFooter>
      </>
    );
  }

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogIcon icon={LifeBuoyIcon} />
        <DialogTitle>Create new backup codes</DialogTitle>
        <DialogDescription>
          Backup codes can't be shown again after setup. Create a new set to replace them; your
          current codes stop working.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="flex flex-col gap-4">
        <PasswordField />
        <FormError message={error} />
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button loading={pending} type="submit">
          Create new codes
        </Button>
      </DialogFooter>
    </form>
  );
}

function DisableDialog({ requiredBy }: { requiredBy: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.disable({ password: formPassword(event) });
    if (error) {
      setError(authErrorMessage(error, "Could not turn off two-factor authentication."));
      setPending(false);
      return;
    }
    toast.success("Two-factor authentication turned off");
    // The re-rendered page no longer shows this dialog.
    router.refresh();
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Turn off
      </DialogTrigger>
      <DialogPopup>
        <form className="contents" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogIcon icon={SmartphoneIcon} tone="danger" />
            <DialogTitle>Turn off two-factor authentication?</DialogTitle>
            <DialogDescription>
              Your password alone will be enough to sign in. Your backup codes stop working.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            {requiredBy.length > 0 ? (
              <Alert variant="warning">
                <AlertDescription>
                  {requiredBy.join(", ")} {requiredBy.length === 1 ? "requires" : "require"}{" "}
                  two-factor authentication. You won't be able to open{" "}
                  {requiredBy.length === 1 ? "it" : "them"} until you turn it back on.
                </AlertDescription>
              </Alert>
            ) : null}
            <PasswordField />
            <p className="text-muted-foreground text-sm">
              Signed in more than a day ago? Sign out and in again first.
            </p>
            <FormError message={error} />
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Turn off
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
