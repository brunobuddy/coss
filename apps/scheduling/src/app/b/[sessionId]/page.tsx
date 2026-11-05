import type { Metadata } from "next";
import { Booker } from "./booker";

export const metadata: Metadata = { title: "Book a time" };
export const dynamic = "force-dynamic";

/** Booking one event type. The server knows only the session id; the token is in the fragment. */
export default async function BookerPage({ params }: PageProps<"/b/[sessionId]">) {
  const { sessionId } = await params;
  return <Booker apiUrl={process.env.API_PUBLIC_URL ?? ""} sessionId={sessionId} />;
}
