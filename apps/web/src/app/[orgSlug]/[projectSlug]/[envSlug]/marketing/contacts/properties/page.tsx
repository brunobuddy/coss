import { listContactProperties } from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { BracesIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";
import { CreatePropertyDialog, DeletePropertyButton } from "../contact-dialogs";

export const metadata: Metadata = { title: "Contact properties" };

const TYPE_LABELS = { string: "Text", number: "Number", boolean: "True / false", date: "Date" };

export default async function ContactPropertiesPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/contacts/properties">) {
  const { env, target, context } = await marketingPage(await params);
  const properties = await listContactProperties(env);
  const canCreate = context.can({ contact: ["create"] });
  const canDelete = context.can({ contact: ["delete"] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={canCreate ? <CreatePropertyDialog {...target} /> : null}
        description="Typed custom fields of this environment's contacts (at most 50), usable in segments and as {{{contact.key}}} in broadcasts."
        title="Contact properties"
      />
      <Panel>
        {properties.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              action={canCreate ? <CreatePropertyDialog {...target} /> : null}
              description="Add a property, e.g. plan or signed_up_at, to store it on contacts."
              icon={BracesIcon}
              title="No custom properties yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fallback</TableHead>
                <TableHead>Added</TableHead>
                {canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {properties.map((property) => (
                <TableRow key={property.id}>
                  <TableCell className="font-mono text-[0.8125rem]">{property.key}</TableCell>
                  <TableCell>{TYPE_LABELS[property.type]}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {property.fallback === null ? "—" : String(property.fallback)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(property.created_at)}
                  </TableCell>
                  {canDelete ? (
                    <TableCell>
                      <DeletePropertyButton
                        {...target}
                        propertyId={property.id}
                        propertyKey={property.key}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
