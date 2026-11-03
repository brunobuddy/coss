"use client";

import { MAX_SUPPORT_ATTACHMENT_BYTES, MAX_SUPPORT_ATTACHMENTS } from "@coss/support/schemas";
import { Button } from "@coss/ui/components/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@coss/ui/components/menu";
import { Textarea } from "@coss/ui/components/textarea";
import { PaperclipIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import type { ActionResult } from "@/lib/action-result";
import { formatBytes } from "@/lib/format";
import { toast, useActionToast } from "@/lib/toast";

export type ComposerMode = { value: string; label: string; placeholder: string; hint?: string };

type Upload = { id: string; filename: string; size: number };

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // A draft is a convenience: private windows can refuse it.
  }
}

/** For a form that navigates away on success, which skips the composer's own clearing. */
export function clearSupportDraft(key: string): void {
  writeDraft(key, "");
}

/**
 * Writes to a ticket: a draft that survives a reload, attachments uploaded as they're picked, and
 * ⌘↵ to send. The page refreshing around it keeps all of that.
 */
export function SupportComposer(props: {
  action: (previous: ActionResult<null> | null, formData: FormData) => Promise<ActionResult<null>>;
  hidden: Record<string, string>;
  draftKey: string;
  modes: ComposerMode[];
  success: (mode: string) => string;
  /** Rendered beside the send button: more ways to send. */
  extraActions?: (input: { pending: boolean; mode: string }) => ReactNode;
  sendLabel?: (mode: string) => string;
  warning?: ReactNode;
  savedReplies?: { id: string; title: string; body: string }[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileId = useId();
  const [mode, setMode] = useState(props.modes[0]?.value ?? "reply");
  const [text, setText] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploading, setUploading] = useState(0);
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    setShortcut(/mac|iphone|ipad/i.test(navigator.platform) ? "⌘↵" : "Ctrl+↵");
  }, []);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => setText(readDraft(props.draftKey)), [props.draftKey]);

  const [state, formAction, pending] = useActionToast(props.action, {
    success: () => props.success(modeRef.current),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a success clears this ticket's draft.
  useEffect(() => {
    if (!state?.ok) return;
    setText("");
    setUploads([]);
    writeDraft(props.draftKey, "");
    setMode(props.modes[0]?.value ?? "reply");
  }, [state]);

  useEffect(() => {
    const focus = (event: Event) => {
      const wanted = (event as CustomEvent<string>).detail;
      if (props.modes.some((item) => item.value === wanted)) setMode(wanted);
      box.current?.focus();
    };
    window.addEventListener("support:compose", focus);
    return () => window.removeEventListener("support:compose", focus);
  }, [props.modes]);

  async function upload(files: FileList | null) {
    for (const file of Array.from(files ?? [])) {
      if (uploads.length >= MAX_SUPPORT_ATTACHMENTS) {
        toast.error(`At most ${MAX_SUPPORT_ATTACHMENTS} attachments`);
        return;
      }
      if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is too large`, "Files can be up to 10 MB.");
        continue;
      }
      setUploading((count) => count + 1);
      try {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch("/api/support/attachments", { method: "POST", body });
        const result = (await response.json()) as Upload | { error: string };
        if ("error" in result) toast.error(`Couldn't attach ${file.name}`, result.error);
        else setUploads((current) => [...current, result]);
      } catch {
        toast.error(`Couldn't attach ${file.name}`);
      } finally {
        setUploading((count) => count - 1);
      }
    }
  }

  const current = props.modes.find((item) => item.value === mode) ?? props.modes[0];
  const blocked = pending || uploading > 0;
  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3"
      ref={form}
    >
      {Object.entries(props.hidden).map(([name, value]) => (
        <input name={name} type="hidden" value={value} key={name} />
      ))}
      <input name="mode" type="hidden" value={mode} />
      {uploads.map((item) => (
        <input key={item.id} name="attachmentIds" type="hidden" value={item.id} />
      ))}
      {props.modes.length > 1 ? (
        <div className="flex gap-1">
          {props.modes.map((item) => (
            <Button
              aria-pressed={item.value === mode}
              key={item.value}
              onClick={() => setMode(item.value)}
              size="xs"
              type="button"
              variant={item.value === mode ? "secondary" : "ghost"}
            >
              {item.label}
            </Button>
          ))}
          {props.savedReplies?.length ? (
            <Menu>
              <MenuTrigger
                render={<Button className="ms-auto" size="xs" type="button" variant="ghost" />}
              >
                Saved replies
              </MenuTrigger>
              <MenuPopup align="end">
                {props.savedReplies.map((item) => (
                  <MenuItem
                    key={item.id}
                    onClick={() => {
                      const next = text ? `${text}\n\n${item.body}` : item.body;
                      setText(next);
                      writeDraft(props.draftKey, next);
                      box.current?.focus();
                    }}
                  >
                    {item.title}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          ) : null}
        </div>
      ) : null}
      {props.warning && mode !== "note" ? props.warning : null}
      <Textarea
        aria-label={current?.label ?? "Message"}
        name="body"
        onChange={(event) => {
          setText(event.target.value);
          writeDraft(props.draftKey, event.target.value);
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !blocked) {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
        placeholder={current?.placeholder}
        ref={box}
        required
        rows={5}
        value={text}
      />
      {current?.hint ? <p className="text-muted-foreground text-xs">{current.hint}</p> : null}
      {uploads.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {uploads.map((item) => (
            <li
              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
              key={item.id}
            >
              <PaperclipIcon className="size-3 text-muted-foreground" />
              <span className="max-w-48 truncate">{item.filename}</span>
              <span className="font-mono text-muted-foreground">{formatBytes(item.size)}</span>
              <button
                aria-label={`Remove ${item.filename}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setUploads((list) => list.filter((upload) => upload.id !== item.id))}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
          htmlFor={fileId}
        >
          <PaperclipIcon className="size-3.5" />
          {uploading > 0 ? "Uploading…" : "Attach"}
        </label>
        <input
          className="sr-only"
          id={fileId}
          multiple
          onChange={(event) => {
            void upload(event.target.files);
            event.target.value = "";
          }}
          type="file"
        />
        {shortcut ? (
          <span className="hidden text-muted-foreground text-xs sm:inline">{shortcut} to send</span>
        ) : null}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {props.extraActions?.({ pending: blocked, mode })}
          <Button disabled={blocked} loading={pending} size="sm" type="submit">
            {props.sendLabel?.(mode) ?? "Send"}
          </Button>
        </div>
      </div>
      {state && !state.ok ? <FormError message={state.error} /> : null}
    </form>
  );
}
