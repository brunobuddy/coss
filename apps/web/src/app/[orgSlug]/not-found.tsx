"use client";

import { Button } from "@coss/ui/components/button";
import { CompassIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";

/** Inside the shell: a stale link keeps the sidebar. A non-member's 404 comes from the layout, above this. */
export default function OrganizationNotFound() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <EmptyState
      action={
        <Button render={<Link href={`/${orgSlug}`} />} variant="outline">
          Go to the organization
        </Button>
      }
      description="This page doesn't exist, or it was deleted."
      icon={CompassIcon}
      title="Not found"
    />
  );
}
