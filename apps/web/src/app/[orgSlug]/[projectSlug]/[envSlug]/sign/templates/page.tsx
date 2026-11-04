import { listSignTemplates } from "@coss/sign";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { LayoutTemplateIcon } from "lucide-react";
import type { Metadata } from "next";
import { CursorPager } from "@/components/cursor-pager";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { signPageContext } from "../page-context";
import { DeleteTemplateButton, NewTemplateButton, OpenBuilderButton } from "../sign-actions";

export const metadata: Metadata = { title: "Sign templates" };

const PAGE_SIZE = 50;

export default async function SignTemplatesPage({
  params,
  searchParams,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/sign/templates">) {
  const { organization, environment, can, target, signPath } = await signPageContext(await params);
  const search = await searchParams;
  const after = typeof search.after === "string" ? search.after : undefined;
  const { data, hasMore } = await listSignTemplates({
    organizationId: organization.id,
    environmentId: environment.id,
    limit: PAGE_SIZE,
    after,
  });
  const listPath = `${signPath}/templates`;
  const last = data.at(-1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={can({ sign: ["create"] }) ? <NewTemplateButton {...target} /> : null}
        description="Documents with fields for roles, made into requests with coss.sign.templates.createRequest(). Edit them in the builder, or let your own users do it (createBuilderSession)."
        title="Templates"
      />
      <Panel
        footer={
          after || hasMore ? (
            <CursorPager
              newestHref={after ? listPath : undefined}
              olderHref={hasMore && last ? `${listPath}?after=${last.id}` : undefined}
            />
          ) : null
        }
      >
        {data.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              action={can({ sign: ["create"] }) ? <NewTemplateButton {...target} /> : null}
              description="Create one here, or with coss.sign.templates.create()."
              icon={LayoutTemplateIcon}
              title={after ? "No more templates" : "No templates yet"}
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Signers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{template.name}</span>
                      <span className="font-mono text-muted-foreground text-xs">{template.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {template.roles.map((role) => role.name).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    {template.ready ? (
                      <Badge variant="success">Ready</Badge>
                    ) : (
                      <Badge variant="outline">Not ready</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(template.updated_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {can({ sign: ["update"] }) ? (
                        <OpenBuilderButton {...target} templateId={template.id} />
                      ) : null}
                      {can({ sign: ["delete"] }) ? (
                        <DeleteTemplateButton
                          {...target}
                          name={template.name}
                          templateId={template.id}
                        />
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
