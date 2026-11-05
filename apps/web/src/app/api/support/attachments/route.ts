import { attachmentFilenameProblem } from "@coss/email/schemas";
import { SupportError, storeSupportUpload } from "@coss/support";
import { MAX_SUPPORT_ATTACHMENT_BYTES } from "@coss/support/schemas";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { getSession } from "@/lib/session";
import { supportStore } from "@/lib/support";

// A session cookie alone must not be able to post here from another site.
function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(env.BETTER_AUTH_URL).origin;
}

/** Stores one file for the message being written; the message claims it when it's sent. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "This request isn't allowed." }, { status: 403 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (session.session.impersonatedBy) {
    return NextResponse.json(
      { error: "You can't write to support while impersonating someone." },
      { status: 403 },
    );
  }
  const store = supportStore();
  if (!store) {
    return NextResponse.json({ error: "Attachments aren't available." }, { status: 503 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_SUPPORT_ATTACHMENT_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Files can be up to 10 MB." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  // Anything a rep attaches goes out by email, so refuse what could never be sent.
  const problem = attachmentFilenameProblem(file.name);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  try {
    const upload = await storeSupportUpload(
      {
        uploadedByUserId: session.user.id,
        filename: file.name,
        contentType: file.type,
        content: new Uint8Array(await file.arrayBuffer()),
      },
      store,
    );
    return NextResponse.json(upload);
  } catch (error) {
    if (error instanceof SupportError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
