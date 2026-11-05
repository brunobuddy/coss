import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { marketingPage } from "@/lib/marketing";
import { segmentEditorData } from "../editor-data";
import { SegmentEditor } from "../segment-builder";

export const metadata: Metadata = { title: "New segment" };

export default async function NewSegmentPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/segments/new">) {
  const { env, target, context } = await marketingPage(await params);
  if (!context.can({ contact: ["create"] })) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Contacts are matched whenever the segment is used."
        title="New segment"
      />
      <Panel>
        <PanelBody>
          <SegmentEditor
            {...target}
            {...(await segmentEditorData(env))}
            canEdit
            filter={null}
            name=""
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
