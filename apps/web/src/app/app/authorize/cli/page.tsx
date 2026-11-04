import { CLI_KEY_NAME_PREFIX, cliCallbackUrl, cliVerificationCode } from "@coss/auth/cli";
import { API_KEY_NAME_MAX_LENGTH } from "@coss/auth/constants";
import { orgAccess } from "@coss/auth/org-access";
import { orgRoleCan } from "@coss/auth/permissions";
import {
  getMembership,
  keyCreationAllowed,
  listProjectsWithEnvironments,
  listUserOrganizations,
} from "@coss/tenancy";
import { Button } from "@coss/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@coss/ui/components/card";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AuthFrame } from "@/components/auth-frame";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/session";
import { CliAuthorizeForm, type EnvironmentOption } from "./cli-authorize-form";
import { CreateFirstProjectButton } from "./create-first-project-button";
import { cliAuthorizePath, parseCliAuthorizeParams } from "./params";

export const metadata: Metadata = { title: "Sign in to the coss.com CLI" };

function AuthorizeCard(props: { title?: string; description: ReactNode; children?: ReactNode }) {
  return (
    <AuthFrame>
      <Card>
        <CardHeader>
          <CardTitle>{props.title ?? "Sign in to the coss.com CLI"}</CardTitle>
          <CardDescription>{props.description}</CardDescription>
        </CardHeader>
        {props.children ? (
          <CardPanel className="flex flex-col gap-3">{props.children}</CardPanel>
        ) : null}
      </Card>
    </AuthFrame>
  );
}

function keyName(params: { host: string; project: string }): string {
  const name = params.project
    ? `${params.project} · coss init`
    : params.host
      ? `${CLI_KEY_NAME_PREFIX} · ${params.host}`
      : CLI_KEY_NAME_PREFIX;
  return name.slice(0, API_KEY_NAME_MAX_LENGTH);
}

/** Opened by `coss login`; approving hands the CLI a one-time code for a new API key. */
export default async function AuthorizeCliPage({ searchParams }: PageProps<"/app/authorize/cli">) {
  const params = parseCliAuthorizeParams(await searchParams);
  if (!params) {
    return (
      <AuthorizeCard
        description="This sign-in link is incomplete. Run `coss login` again."
        title="Invalid sign-in link"
      />
    );
  }

  const here = cliAuthorizePath(params);
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(here)}`);
  const next = `/sign-in?next=${encodeURIComponent(here)}`;
  if (session.session.impersonatedBy) {
    return (
      <AuthorizeCard description="Impersonation sessions can't sign in to the CLI.">
        <SignOutButton redirectTo={next} />
      </AuthorizeCard>
    );
  }

  // Only organizations where this member may create keys now: their role allows it, the
  // organization isn't suspended, and this session meets its SSO and two-factor requirements.
  // CLI keys are personal keys, so members see the environments open to theirs.
  const organizations = await listUserOrganizations({ userId: session.user.id });
  // A new account: the approval page comes back once there is an organization.
  if (organizations.length === 0) redirect(`/onboarding?next=${encodeURIComponent(here)}`);
  const candidates = organizations.filter((org) => orgRoleCan(org.role, { apiKey: ["create"] }));
  const environments: EnvironmentOption[] = [];
  const blocked: string[] = [];
  const withoutProject: { name: string; slug: string }[] = [];
  for (const org of candidates) {
    const membership = await getMembership({ userId: session.user.id, organizationSlug: org.slug });
    if (!membership || membership.suspended) continue;
    if (orgAccess(membership, session).kind !== "allowed") {
      blocked.push(org.name);
      continue;
    }
    const projects = await listProjectsWithEnvironments({
      organizationId: membership.organization.id,
    });
    if (projects.length === 0 && orgRoleCan(org.role, { project: ["create"] })) {
      withoutProject.push({ name: org.name, slug: org.slug });
    }
    for (const { project, environments: envs } of projects) {
      for (const env of envs) {
        // `coss init` writes the key into a project's files: never a live one.
        if (params.project && env.mode === "live") continue;
        const userId = session.user.id;
        if (
          !keyCreationAllowed({
            role: org.role,
            environment: env,
            ownerUserId: userId,
            creatorUserId: userId,
          })
        ) {
          continue;
        }
        environments.push({
          value: `${org.slug}/${project.slug}/${env.slug}`,
          label: `${org.name} · ${project.name} · ${env.name}${env.mode === "live" ? " (live)" : ""}`,
          live: env.mode === "live",
        });
      }
    }
  }

  const cancelUrl =
    params.port === null
      ? null
      : cliCallbackUrl(params.port, { error: "access_denied", state: params.state });
  const verification = cliVerificationCode(params.codeChallenge);

  const blockedNote =
    blocked.length > 0 ? (
      <p className="text-muted-foreground text-xs">
        Not listed: {blocked.join(", ")}, which require single sign-on or two-factor authentication
        this session doesn't have. Open the organization in the dashboard first.
      </p>
    ) : null;

  const title = params.project ? `Create an API key for ${params.project}` : undefined;
  if (environments.length === 0 && withoutProject.length > 0) {
    return (
      <AuthorizeCard
        description={
          <>
            API keys belong to a project's environments, and{" "}
            {withoutProject.map((org) => org.name).join(", ")}{" "}
            {withoutProject.length === 1 ? "has" : "have"} no project yet. Create one to continue.
          </>
        }
        title={title}
      >
        {withoutProject.map((org) => (
          <CreateFirstProjectButton key={org.slug} name={org.name} orgSlug={org.slug} />
        ))}
        {blockedNote}
        <SignOutButton redirectTo={next} />
      </AuthorizeCard>
    );
  }
  if (environments.length === 0) {
    return (
      <AuthorizeCard
        description={
          params.project ? (
            <>
              You can't create API keys in a sandbox environment of any of your organizations. Ask
              an owner or admin for a development key and add it to your project as{" "}
              <code>COSS_API_KEY</code>.
            </>
          ) : (
            <>
              You can't create API keys in any of your organizations. Ask an owner or admin for a
              key, then run <code>coss login --manual</code> and paste it.
            </>
          )
        }
        title={title}
      >
        {blockedNote}
        <SignOutButton redirectTo={next} />
      </AuthorizeCard>
    );
  }

  const defaultEnvironment =
    environments.find((option) => !option.live)?.value ?? environments[0]?.value ?? "";
  return (
    <AuthorizeCard
      description={
        <>
          Signed in as {session.user.email}.
          {params.project ? " coss init writes a development key into the project's files." : ""}{" "}
          Only continue if your terminal shows this code:
        </>
      }
      title={title}
    >
      <p className="text-center font-mono font-semibold text-2xl tracking-widest">{verification}</p>
      <CliAuthorizeForm
        codeChallenge={params.codeChallenge}
        defaultEnvironment={defaultEnvironment}
        defaultName={keyName(params)}
        environments={environments}
        maxNameLength={API_KEY_NAME_MAX_LENGTH}
        port={params.port}
        state={params.state}
      />
      {blockedNote}
      {cancelUrl ? (
        <Button render={<a href={cancelUrl} />} variant="ghost">
          Cancel
        </Button>
      ) : null}
      <p className="text-center text-muted-foreground text-xs">
        The key is your personal key: what it sends counts as your spend. It is listed under the
        environment's API keys, where you can revoke it.
      </p>
    </AuthorizeCard>
  );
}
