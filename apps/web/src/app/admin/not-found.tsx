import { Button } from "@coss/ui/components/button";
import { CompassIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

export default function AdminNotFound() {
  return (
    <EmptyState
      action={
        <Button render={<Link href="/admin" />} variant="outline">
          Go to the admin console
        </Button>
      }
      description="This page doesn't exist, or it was deleted."
      icon={CompassIcon}
      title="Not found"
    />
  );
}
