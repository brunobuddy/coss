import { getSegment } from "@coss/email";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { marketingPage } from "@/lib/marketing";
import { segmentEditorData } from "../editor-data";
import { DeleteSegmentButton, SegmentEditor } from "../segment-builder";

export const metadata: Metadata = { title: "Segment" };

export default async function SegmentPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/segments/[segmentId]">) {
  const resolved = await params;
  const { env, target, context } = await marketingPage(resolved);
  const segment = await getSegment(env, resolved.segmentId);
  if (!segment) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          context.can({ contact: ["delete"] }) ? (
            <DeleteSegmentButton {...target} name={segment.name} segmentId={segment.id} />
          ) : null
        }
        description={`Updated ${formatDateTime(segment.updated_at)}.`}
        title={segment.name}
      />
      <Panel>
        <PanelBody>
          <SegmentEditor
            {...target}
            {...(await segmentEditorData(env))}
            canEdit={context.can({ contact: ["update"] })}
            filter={segment.filter}
            name={segment.name}
            segmentId={segment.id}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
