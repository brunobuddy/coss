import type { Metadata } from "next";
import { type TeamFocus, TeamPortal } from "./team-portal";

export const metadata: Metadata = { title: "Team cover" };
export const dynamic = "force-dynamic";

/** A team lead's page: who's away, what needs cover, and moving it. */
export default async function TeamPage({ params, searchParams }: PageProps<"/t/[sessionId]">) {
  const { sessionId } = await params;
  const search = await searchParams;
  const param = (name: string) => (typeof search[name] === "string" ? search[name] : undefined);
  const focus: TeamFocus = {
    ...(param("tab") ? { tab: param("tab") as string } : {}),
    ...(param("booking") ? { booking: param("booking") as string } : {}),
    ...(param("out_of_office") ? { outOfOffice: param("out_of_office") as string } : {}),
  };
  return (
    <TeamPortal apiUrl={process.env.API_PUBLIC_URL ?? ""} focus={focus} sessionId={sessionId} />
  );
}
