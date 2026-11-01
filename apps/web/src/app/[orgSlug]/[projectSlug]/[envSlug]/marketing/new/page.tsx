import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { marketingPage } from "@/lib/marketing";
import { BroadcastEditor, EMPTY_DRAFT } from "../broadcast-editor";
import { broadcastEditorData } from "../editor-data";

export const metadata: Metadata = { title: "New broadcast" };

export default async function NewBroadcastPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/marketing/new">) {
  const { env, target, context } = await marketingPage(await params, "broadcast");
  if (!context.can({ broadcast: ["create"] })) notFound();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Save it as a draft, preview it and send a test, then send or schedule it."
        title="New broadcast"
      />
      <Panel>
        <PanelBody>
          <BroadcastEditor
            {...target}
            {...(await broadcastEditorData(env))}
            canEdit
            draft={EMPTY_DRAFT}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
