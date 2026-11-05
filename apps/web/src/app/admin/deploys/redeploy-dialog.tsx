import { AdminActionDialog } from "@/components/admin/admin-action-dialog";
import { shortSha } from "@/components/admin/deploys";
import { redeployAction } from "./actions";

/** Puts production back on `commit`, an earlier deploy's (offered only for `redeployableCommits`). */
export function RedeployDialog(props: { commit: string }) {
  return (
    <AdminActionDialog
      icon="deploy"
      action={redeployAction}
      description={`Production goes back to ${shortSha(props.commit)}'s images (already built) until main is deployed again: the next push or Deploy now. Push runs waiting for their batch are canceled. Database migrations aren't undone, so the older code must work with today's schema.`}
      destructive
      fields={{ commit: props.commit }}
      reason="required"
      reasonPlaceholder="e.g. Sign-in broken since the last deploy"
      submitLabel="Redeploy"
      success={{
        title: "Redeploy started",
        description: "It appears under Runs in a few seconds.",
      }}
      title={`Redeploy ${shortSha(props.commit)}?`}
      triggerLabel="Redeploy"
    />
  );
}
