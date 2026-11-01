"use client";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { FolderSyncIcon, KeyIcon, PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { DialogIcon } from "@/components/dialog-icon";
import { FormError } from "@/components/form-error";
import { SettingsFooter, SettingsNote, SettingsRow } from "@/components/settings";
import { useActionToast } from "@/lib/toast";
import {
  connectScimAction,
  createScimTokenAction,
  disconnectScimAction,
  revokeScimTokenAction,
  saveScimGroupRolesAction,
} from "./actions";

const LIFETIME_ITEMS = [
  { label: "90 days", value: "90" },
  { label: "1 year", value: "365" },
  { label: "2 years", value: "730" },
];

const ROLE_ITEMS = [
  { label: "Member", value: "member" },
  { label: "Admin", value: "admin" },
];

function LifetimeSelect(props: { id: string }) {
  return (
    <Select defaultValue="365" items={LIFETIME_ITEMS} name="lifetimeDays">
      <SelectTrigger aria-label="Token expires after" className="w-32" id={props.id}>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {LIFETIME_ITEMS.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

/** A token shown once, right after it was issued, as a stacked row of its section's card. */
function NewToken({ token }: { token: string }) {
  return (
    <SettingsRow
      description="Copy it into your identity provider now. For security it won't be shown again."
      label="New token"
      stacked
    >
      <div className="flex flex-col items-start gap-2">
        <code className="block w-full select-all break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">
          {token}
        </code>
        <CopyButton label="Copy token" value={token} />
      </div>
    </SettingsRow>
  );
}

/**
 * Connect / disconnect, as rows of the Directory section. One component for both states:
 * connecting re-renders the page as connected, and the first token (kept in this component's
 * action state) must stay on screen.
 */
export function ScimConnectionControls(props: {
  orgSlug: string;
  status: "none" | "active" | "decommissioning";
  canConnect: boolean;
}) {
  const [state, formAction, pending] = useActionToast(connectScimAction, {
    success: "Directory connected",
  });
  if (props.status !== "none") {
    return (
      <>
        {state?.ok ? <NewToken token={state.data.token} /> : null}
        <DisconnectScimButton orgSlug={props.orgSlug} resume={props.status === "decommissioning"} />
      </>
    );
  }
  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <SettingsRow
        description={
          <>
            Creates the connection and its first bearer token. From then on, only the directory's
            active users can sign in with SSO.
            {state && !state.ok ? (
              <span className="mt-1 block text-destructive-foreground">{state.error}</span>
            ) : null}
          </>
        }
        label={<label htmlFor="scim-connect-lifetime">Connect a directory</label>}
      >
        <LifetimeSelect id="scim-connect-lifetime" />
        <Button disabled={!props.canConnect} loading={pending} size="sm" type="submit">
          Connect
        </Button>
      </SettingsRow>
    </form>
  );
}

/** The Tokens section's footer: a lifetime and "New token"; the token appears above it once. */
export function CreateScimTokenForm(props: { orgSlug: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionToast(createScimTokenAction, {
    success: "SCIM token created",
  });
  return (
    <>
      {state?.ok ? <NewToken token={state.data.token} /> : null}
      <form action={formAction}>
        <input name="orgSlug" type="hidden" value={props.orgSlug} />
        <SettingsFooter
          hint={
            state && !state.ok ? (
              <span className="text-destructive-foreground">{state.error}</span>
            ) : (
              <label htmlFor="scim-token-lifetime">Expires after</label>
            )
          }
        >
          <LifetimeSelect id="scim-token-lifetime" />
          <Button
            disabled={props.disabled}
            loading={pending}
            size="sm"
            type="submit"
            variant="outline"
          >
            New token
          </Button>
        </SettingsFooter>
      </form>
    </>
  );
}

export function RevokeScimTokenButton(props: { orgSlug: string; credentialId: string }) {
  // On success the page re-renders without this token, which unmounts the dialog.
  const [state, formAction, pending] = useActionToast(revokeScimTokenAction, {
    success: "SCIM token revoked",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Revoke
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.orgSlug} />
          <input name="credentialId" type="hidden" value={props.credentialId} />
          <AlertDialogHeader>
            <DialogIcon icon={KeyIcon} tone="danger" />
            <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
            <AlertDialogDescription>
              Your identity provider stops syncing until it uses another token.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Revoke token
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function DisconnectScimButton(props: { orgSlug: string; resume: boolean }) {
  const [state, formAction, pending] = useActionToast(disconnectScimAction, {
    success: "Directory disconnected",
  });
  if (props.resume) {
    return (
      <form action={formAction}>
        <input name="orgSlug" type="hidden" value={props.orgSlug} />
        <SettingsRow
          description={
            <>
              Some of the directory's users are still being released.
              {state && !state.ok ? (
                <span className="mt-1 block text-destructive-foreground">{state.error}</span>
              ) : null}
            </>
          }
          label="Finish disconnecting"
        >
          <Button loading={pending} size="sm" type="submit" variant="outline">
            Continue disconnecting
          </Button>
        </SettingsRow>
      </form>
    );
  }
  return (
    <SettingsRow
      description="Every token stops working at once. Members the directory added stay."
      label="Disconnect the directory"
    >
      <AlertDialog>
        <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
          Disconnect
        </AlertDialogTrigger>
        <AlertDialogPopup>
          <form action={formAction} className="contents">
            <input name="orgSlug" type="hidden" value={props.orgSlug} />
            <AlertDialogHeader>
              <DialogIcon icon={FolderSyncIcon} tone="danger" />
              <AlertDialogTitle>Disconnect the directory?</AlertDialogTitle>
              <AlertDialogDescription>
                Every token stops working at once. Members the directory added stay, as ordinary
                members you manage here, and anyone on your SSO domains can sign in with SSO again.
              </AlertDialogDescription>
              {state && !state.ok ? <FormError message={state.error} /> : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
              <Button loading={pending} type="submit" variant="destructive">
                Disconnect
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogPopup>
      </AlertDialog>
    </SettingsRow>
  );
}

type MappingRow = { key: number; groupName: string; role: "admin" | "member" };

/**
 * Directory group → role mappings, edited as a list in the Group roles section's card and saved
 * together from its footer.
 */
export function ScimGroupRolesForm(props: {
  orgSlug: string;
  mappings: { groupName: string; role: "admin" | "member" }[];
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionToast(saveScimGroupRolesAction, {
    success: "Group mappings saved and applied",
  });
  const [rows, setRows] = useState<MappingRow[]>(() =>
    props.mappings.map((mapping, index) => ({ key: index, ...mapping })),
  );
  const [nextKey, setNextKey] = useState(props.mappings.length);

  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      {rows.length === 0 ? (
        <SettingsNote>No mappings: everyone the directory provisions is a member.</SettingsNote>
      ) : (
        <>
          <div className="flex gap-3 border-t bg-muted/40 px-5 py-2 font-medium text-muted-foreground text-xs">
            <span className="flex-1">Group name</span>
            <span className="w-32">Role</span>
            <span className="w-8" />
          </div>
          {rows.map((row) => (
            <div className="flex items-center gap-3 border-t px-5 py-3" key={row.key}>
              <Input
                aria-label="Group name"
                className="min-w-0 flex-1"
                disabled={props.disabled}
                name="groupName"
                onChange={(event) => {
                  const groupName = event.target.value;
                  setRows((current) =>
                    current.map((r) => (r.key === row.key ? { ...r, groupName } : r)),
                  );
                }}
                placeholder="e.g. coss.com Admins"
                required
                value={row.groupName}
              />
              <Select
                disabled={props.disabled}
                items={ROLE_ITEMS}
                name="role"
                onValueChange={(role) => {
                  if (role !== "admin" && role !== "member") return;
                  setRows((current) =>
                    current.map((r) => (r.key === row.key ? { ...r, role } : r)),
                  );
                }}
                value={row.role}
              >
                <SelectTrigger aria-label="Role" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {ROLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button
                aria-label="Remove mapping"
                className="text-muted-foreground"
                disabled={props.disabled}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </div>
          ))}
        </>
      )}
      {props.disabled ? null : (
        <SettingsFooter
          hint={
            state && !state.ok ? (
              <span className="text-destructive-foreground">{state.error}</span>
            ) : null
          }
        >
          <Button
            onClick={() => {
              setRows((current) => [...current, { key: nextKey, groupName: "", role: "admin" }]);
              setNextKey((key) => key + 1);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            Add group
          </Button>
          <Button loading={pending} size="sm" type="submit">
            Save mappings
          </Button>
        </SettingsFooter>
      )}
    </form>
  );
}
