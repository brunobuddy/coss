import "server-only";
import type { SupportAttachmentRow } from "@coss/support";
import { notFound } from "next/navigation";
import { supportStore } from "./support";

/** A ticket's file, always as an opaque download: anyone can email us anything. */
export async function supportDownloadResponse(
  attachment: SupportAttachmentRow | null,
): Promise<Response> {
  const store = supportStore();
  if (!attachment || !store) notFound();
  const content = await store.get(attachment.storeKey);
  if (!content) notFound();
  const name = attachment.filename.replace(/["\\\r\n]/g, "_");
  return new Response(Buffer.from(content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
