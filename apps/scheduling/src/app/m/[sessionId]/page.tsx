import type { Metadata } from "next";
import { Manage } from "./manage";

export const metadata: Metadata = { title: "Your booking" };
export const dynamic = "force-dynamic";

/** Rescheduling or cancelling one booking, from the link in its email. */
export default async function ManagePage({ params }: PageProps<"/m/[sessionId]">) {
  const { sessionId } = await params;
  return <Manage apiUrl={process.env.API_PUBLIC_URL ?? ""} sessionId={sessionId} />;
}
