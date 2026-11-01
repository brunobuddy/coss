"use client";

import { Button } from "@coss/ui/components/button";
import { useActionToast } from "@/lib/toast";
import { cancelMigrationAction } from "../actions";

export function CancelImportButton(props: {
  orgSlug: string;
  projectSlug: string;
  envSlug: string;
  migrationId: string;
}) {
  const [, formAction, pending] = useActionToast(cancelMigrationAction, {
    success: "Import canceled",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="projectSlug" type="hidden" value={props.projectSlug} />
      <input name="envSlug" type="hidden" value={props.envSlug} />
      <input name="migrationId" type="hidden" value={props.migrationId} />
      <Button loading={pending} size="sm" type="submit" variant="outline">
        Cancel import
      </Button>
    </form>
  );
}
