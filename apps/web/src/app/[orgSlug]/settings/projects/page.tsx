import { PROJECT_NAME_MAX_LENGTH } from "@coss/tenancy";
import { ArrowUpRightIcon, FolderIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { StatusDot } from "@/components/status-dot";
import { formatDateTime } from "@/lib/format";
import { environmentPath } from "@/lib/navigation";
import { listProjectsWithDefaultEnvironment } from "@/lib/projects";
import { requireOrgMember } from "@/lib/session";
import { CreateProjectDialog } from "./create-project-form";
import { RenameProjectDialog } from "./rename-project-form";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/settings/projects">) {
  const { orgSlug } = await params;
  const { new: create } = await searchParams;
  const { organization, can } = await requireOrgMember(orgSlug);
  const projects = await listProjectsWithDefaultEnvironment(organization.id);
  const canCreate = can({ project: ["create"] });
  const canRename = can({ project: ["update"] });
  const createDialog = canCreate ? (
    <CreateProjectDialog
      defaultOpen={create === "1"}
      maxLength={PROJECT_NAME_MAX_LENGTH}
      orgSlug={organization.slug}
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={createDialog}
        description="Each project has a production (live) and a development (sandbox) environment, each with its own API keys, emails, logs and webhooks."
        title="Projects"
      />
      {projects.length === 0 ? (
        <Panel>
          <PanelBody flush>
            <EmptyState
              action={
                canCreate ? (
                  <CreateProjectDialog
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    orgSlug={organization.slug}
                  />
                ) : null
              }
              description={
                canCreate
                  ? "Create a project to get API keys and start sending."
                  : "An owner or admin can create the first project."
              }
              icon={FolderIcon}
              title="No projects yet"
            />
          </PanelBody>
        </Panel>
      ) : (
        // Ruled tiles: hairlines between cells, like coss.com's catalog.
        // Each tile draws its right and bottom rules; the container clips the outer ones.
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          <div className="-me-px -mb-px grid md:grid-cols-2 xl:grid-cols-3">
            {projects.map(({ project, environments, defaultEnvironment: opens }) => {
              return (
                <article
                  className="group relative flex flex-col border-e border-b"
                  key={project.id}
                >
                  <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background shadow-xs/5">
                      <FolderIcon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <h2 className="truncate font-heading font-semibold text-lg tracking-[-0.01em]">
                        {opens ? (
                          <Link
                            className="after:absolute after:inset-0 focus-visible:outline-none"
                            href={environmentPath(organization.slug, project.slug, opens.slug)}
                          >
                            {project.name}
                          </Link>
                        ) : (
                          project.name
                        )}
                      </h2>
                      <span className="truncate font-mono text-muted-foreground text-xs">
                        {project.slug}
                      </span>
                    </div>
                    {canRename ? (
                      // Above the title link's overlay, so it gets the click.
                      <div className="relative z-10 -me-1.5 -mt-1">
                        <RenameProjectDialog
                          maxLength={PROJECT_NAME_MAX_LENGTH}
                          orgSlug={organization.slug}
                          project={{ id: project.id, name: project.name, slug: project.slug }}
                        />
                      </div>
                    ) : (
                      <ArrowUpRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                  </div>
                  <ul className="relative z-10 mt-auto flex flex-col border-t">
                    {environments.map((env) => (
                      <li className="border-t first:border-t-0" key={env.id}>
                        <Link
                          className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-accent/40"
                          href={environmentPath(organization.slug, project.slug, env.slug)}
                        >
                          <StatusDot tone={env.mode === "live" ? "success" : "info"}>
                            {env.name}
                          </StatusDot>
                          <span className="font-mono text-muted-foreground text-xs">
                            {env.mode === "live" ? "live" : "sandbox"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <div className="relative z-10 border-t px-5 py-2.5 text-muted-foreground text-xs">
                    Created {formatDateTime(project.createdAt)}
                  </div>
                </article>
              );
            })}
            {canCreate ? (
              <div className="drafting-grid flex min-h-48 items-center justify-center border-e border-b p-5">
                <CreateProjectDialog
                  maxLength={PROJECT_NAME_MAX_LENGTH}
                  orgSlug={organization.slug}
                  variant="outline"
                />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
