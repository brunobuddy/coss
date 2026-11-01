import {
  contactAudienceIds,
  getContactRow,
  getContactTopics,
  listContactPropertyRows,
  toContactObject,
} from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactStatusBadge } from "@/components/marketing";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { formatDateTime } from "@/lib/format";
import { listAllAudiences, marketingPage } from "@/lib/marketing";
import { DeleteContactButton } from "../contact-dialogs";
import { AudienceMembershipButton, ContactForm, TopicChoiceButton } from "./contact-forms";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/contacts/[contactId]">) {
  const resolved = await params;
  const { env, target, base, context } = await marketingPage(resolved);
  const row = await getContactRow(env, resolved.contactId);
  if (!row) notFound();
  const contact = toContactObject(row);
  const [definitions, topics, audiences, memberships] = await Promise.all([
    listContactPropertyRows(env),
    getContactTopics(env, contact.id),
    listAllAudiences(env),
    contactAudienceIds(env, contact.id),
  ]);
  const canEdit = context.can({ contact: ["update"] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          context.can({ contact: ["delete"] }) ? (
            <DeleteContactButton {...target} contactId={contact.id} email={contact.email} />
          ) : null
        }
        description={`Added ${formatDateTime(contact.created_at)} (${contact.source}).`}
        meta={<ContactStatusBadge status={contact.status} />}
        title={contact.email}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Details">
          <PanelBody>
            <ContactForm
              {...target}
              canEdit={canEdit}
              contactId={contact.id}
              definitions={definitions.map((d) => ({ key: d.key, type: d.type }))}
              firstName={contact.first_name}
              lastName={contact.last_name}
              properties={contact.properties}
              status={contact.status}
            />
          </PanelBody>
        </Panel>
        <Panel title="Consent">
          <PanelBody flush>
            <SpecList>
              <SpecItem label="Subscribed">{formatDateTime(contact.subscribed_at)}</SpecItem>
              <SpecItem label="Unsubscribed">{formatDateTime(contact.unsubscribed_at)}</SpecItem>
              <SpecItem label="Confirmed (double opt-in)">
                {formatDateTime(contact.confirmed_at)}
              </SpecItem>
              <SpecItem label="Id" mono>
                {contact.id}
              </SpecItem>
            </SpecList>
          </PanelBody>
        </Panel>
      </div>
      <Panel
        description={
          contact.status === "subscribed"
            ? "Emails about a topic reach the contact unless they opted out (opt-in topics) or unless they opted in (opt-out topics)."
            : "The contact isn't subscribed, so no topic's emails reach them."
        }
        title="Topics"
      >
        {topics && topics.topics.length > 0 ? (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Topic</TableHead>
                <TableHead>Choice</TableHead>
                <TableHead>Receives</TableHead>
                {canEdit ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.topics.map((topic) => (
                <TableRow key={topic.topic}>
                  <TableCell className="font-medium">
                    {topic.name}{" "}
                    <span className="font-mono text-muted-foreground text-xs">{topic.topic}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {topic.choice === "opted_in"
                      ? "Opted in"
                      : topic.choice === "opted_out"
                        ? "Opted out"
                        : "Default"}
                  </TableCell>
                  <TableCell>{topic.subscribed ? "Yes" : "No"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <TopicChoiceButton
                        {...target}
                        contactId={contact.id}
                        subscribed={topic.choice ? topic.choice === "opted_in" : topic.subscribed}
                        topic={topic.topic}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <PanelBody>
            <p className="text-muted-foreground text-sm">
              No topics yet.{" "}
              <Link className="underline" href={`${base}/marketing/topics`}>
                Add one
              </Link>
              .
            </p>
          </PanelBody>
        )}
      </Panel>
      <Panel title="Audiences">
        {audiences.data.length > 0 ? (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Audience</TableHead>
                <TableHead>Member</TableHead>
                {canEdit ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {audiences.data.map((audience) => (
                <TableRow key={audience.id}>
                  <TableCell className="font-medium">
                    <Link
                      className="hover:underline"
                      href={`${base}/marketing/audiences/${audience.id}`}
                    >
                      {audience.name}
                    </Link>
                  </TableCell>
                  <TableCell>{memberships.has(audience.id) ? "Yes" : "No"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <AudienceMembershipButton
                        {...target}
                        audienceId={audience.id}
                        contactId={contact.id}
                        member={memberships.has(audience.id)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <PanelBody>
            <p className="text-muted-foreground text-sm">
              No audiences yet.{" "}
              <Link className="underline" href={`${base}/marketing/audiences`}>
                Create one
              </Link>
              .
            </p>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
