import { LifeBuoyIcon } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { requirePlatformAdmin } from "@/lib/session";
import { queueFilters, SupportQueue } from "./queue";
import { StatsStrip } from "./stats";

export const metadata: Metadata = { title: "Support" };

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  const { actor } = await requirePlatformAdmin();
  const filters = queueFilters(await searchParams);
  return (
    <div
      className="flex flex-col gap-4 lg:h-[calc(100dvh-7rem)] lg:flex-row"
      data-page-width="full"
    >
      <SupportQueue activeTicketId={null} actorUserId={actor.userId} filters={filters} />
      <div className="hidden min-w-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex">
        <StatsStrip />
        <div className="flex flex-1 items-center justify-center rounded-xl border">
          <EmptyState
            compact
            description="Pick a ticket from the queue, or press j."
            icon={LifeBuoyIcon}
            title="Nothing open yet"
          />
        </div>
      </div>
    </div>
  );
}
