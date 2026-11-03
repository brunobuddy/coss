import { listSavedReplies } from "@coss/support/admin";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { SupportActionButton } from "@/components/support/support-action";
import { SupportText } from "@/components/support/support-text";
import { requirePlatformAdmin } from "@/lib/session";
import { deleteSavedReplyAction } from "../actions";
import { SavedReplyForm } from "./saved-reply-form";

export const metadata: Metadata = { title: "Saved replies" };

export default async function SavedRepliesPage() {
  await requirePlatformAdmin();
  const replies = await listSavedReplies();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        description="Answers you give often, ready to insert from the composer. Adding one with an existing title replaces it."
        title="Saved replies"
      />
      <Panel title="New saved reply">
        <PanelBody>
          <SavedReplyForm />
        </PanelBody>
      </Panel>
      {replies.map((reply) => (
        <Panel
          action={
            <SupportActionButton
              action={deleteSavedReplyAction}
              hidden={{ id: reply.id }}
              size="xs"
              success="Saved reply deleted"
              variant="ghost"
            >
              Delete
            </SupportActionButton>
          }
          key={reply.id}
          title={reply.title}
        >
          <PanelBody>
            <SupportText text={reply.body} />
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}
