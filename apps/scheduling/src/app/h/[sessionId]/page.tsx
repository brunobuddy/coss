import type { Metadata } from "next";
import { HostPortal } from "./host-portal";

export const metadata: Metadata = { title: "Your availability" };
export const dynamic = "force-dynamic";

/** One host's hours, calendars and bookings. */
export default async function HostPage({ params }: PageProps<"/h/[sessionId]">) {
  const { sessionId } = await params;
  return <HostPortal apiUrl={process.env.API_PUBLIC_URL ?? ""} sessionId={sessionId} />;
}
