import { listTopicRows } from "@coss/email";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { BookmarkIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { marketingPage } from "@/lib/marketing";
import { DeleteTopicButton, TopicDialog } from "./topic-forms";

export const metadata: Metadata = { title: "Topics" };

export default async function TopicsPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/topics">) {
  const { env, target, context } = await marketingPage(await params);
  const topics = await listTopicRows(env);
  const canEdit = context.can({ contact: ["update"] });
  const canDelete = context.can({ contact: ["delete"] });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={context.can({ contact: ["create"] }) ? <TopicDialog {...target} /> : null}
        description="What contacts subscribe to. A topic's key is the category of the emails about it; public topics show in the preference center."
        title="Topics"
      />
      <Panel>
        {topics.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              action={context.can({ contact: ["create"] }) ? <TopicDialog {...target} /> : null}
              description="E.g. a newsletter, product updates or event invitations."
              icon={BookmarkIcon}
              title="No topics yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Visibility</TableHead>
                {canEdit || canDelete ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topics.map((topic) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium">
                    {topic.name}
                    {topic.description ? (
                      <span className="block text-muted-foreground text-xs">
                        {topic.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-[0.8125rem]">{topic.key}</TableCell>
                  <TableCell>
                    {topic.defaultSubscription === "opt_in" ? "Opt-in" : "Opt-out"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {topic.visibility === "public" ? "Public" : "Private"}
                  </TableCell>
                  {canEdit || canDelete ? (
                    <TableCell>
                      <div className="flex gap-2">
                        {canEdit ? (
                          <TopicDialog
                            {...target}
                            topic={{
                              id: topic.id,
                              key: topic.key,
                              name: topic.name,
                              description: topic.description,
                              default_subscription: topic.defaultSubscription,
                              visibility: topic.visibility,
                              position: topic.position,
                            }}
                          />
                        ) : null}
                        {canDelete ? (
                          <DeleteTopicButton {...target} name={topic.name} topicId={topic.id} />
                        ) : null}
                      </div>
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
