import type { Metadata } from "next";
import { TeamPortal } from "./team-portal";

export const metadata: Metadata = { title: "Team cover" };
export const dynamic = "force-dynamic";

/** A team lead's page: who's away, what needs cover, and moving it. */
export default async function TeamPage({ params }: PageProps<"/t/[sessionId]">) {
  const { sessionId } = await params;
  return <TeamPortal apiUrl={process.env.API_PUBLIC_URL ?? ""} sessionId={sessionId} />;
}
