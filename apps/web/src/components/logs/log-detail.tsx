"use client";

import type { LogEntryOutput } from "@coss/logs/schemas";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@coss/ui/components/sheet";
import { Spinner } from "@coss/ui/components/spinner";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { CheckIcon, CopyIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import {
  formatDuration,
  LEVEL_DOT,
  LEVEL_LABEL,
  logTimestamp,
  SOURCE_LABEL,
  statusClassName,
} from "./format";

type Detail = { entry: LogEntryOutput; related: LogEntryOutput[] };

function CopyValue(props: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Needs a secure context; the value stays selectable.
        }
      }}
      size="icon-xs"
      variant="ghost"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}

function Field(props: { label: string; value: ReactNode; copy?: string | null }) {
  if (props.value === null || props.value === undefined || props.value === "") return null;
  return (
    <div className="grid grid-cols-[9rem_1fr] items-start gap-3 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="flex min-w-0 items-center gap-1 break-all">
        <span className="min-w-0">{props.value}</span>
        {props.copy ? <CopyValue value={props.copy} /> : null}
      </dd>
    </div>
  );
}

function Json(props: { value: unknown }) {
  if (props.value === undefined) {
    return <p className="text-muted-foreground text-sm">Not recorded.</p>;
  }
  return (
    <pre className="max-h-[28rem] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
      {JSON.stringify(props.value, null, 2)}
    </pre>
  );
}

type HttpPart = { headers?: Record<string, string>; body?: unknown; query?: string };

/** Everything about one line: fields, request/response, raw attributes and its timeline. */
export function LogDetailSheet(props: {
  entryId: string | null;
  /** The line as listed, shown while the full record loads. */
  preview: LogEntryOutput | null;
  entriesPath: string;
  envPath: string;
  apiKeyNames: Record<string, string>;
  onClose: () => void;
  onSelect: (entry: LogEntryOutput) => void;
  onFilter: (token: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const { entryId } = props;

  useEffect(() => {
    if (!entryId) return;
    const controller = new AbortController();
    setDetail(null);
    setFailed(false);
    fetch(`${props.entriesPath}/${encodeURIComponent(entryId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setDetail((await response.json()) as Detail);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.error(error);
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [entryId, props.entriesPath]);

  const entry = detail?.entry.id === entryId ? detail.entry : props.preview;
  const attributes = (entry?.attributes ?? {}) as {
    request?: HttpPart;
    response?: HttpPart;
    endpoint_id?: string;
    [key: string]: unknown;
  };
  const isRequest = entry?.source === "api";
  const keyName = entry?.api_key_id ? props.apiKeyNames[entry.api_key_id] : undefined;

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      open={entryId !== null}
    >
      <SheetPopup className="max-w-2xl">
        {entry ? (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 pe-8 font-mono text-base">
                <span className={`size-2.5 shrink-0 rounded-full ${LEVEL_DOT[entry.level]}`} />
                <span className="truncate">{entry.message}</span>
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{logTimestamp(entry.occurred_at)}</span>
                <Badge variant="outline">{SOURCE_LABEL[entry.source]}</Badge>
                <Badge
                  variant={
                    entry.level === "error"
                      ? "error"
                      : entry.level === "warning"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {LEVEL_LABEL[entry.level]}
                </Badge>
              </SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <div className="mb-4 flex flex-wrap gap-2">
                {entry.request_id ? (
                  <Button
                    onClick={() => props.onFilter(`request:${entry.request_id}`)}
                    size="xs"
                    variant="outline"
                  >
                    Filter by request
                  </Button>
                ) : null}
                {entry.resource_id ? (
                  <Button
                    onClick={() => props.onFilter(`resource:${entry.resource_id}`)}
                    size="xs"
                    variant="outline"
                  >
                    Filter by resource
                  </Button>
                ) : null}
                {entry.resource_type === "email" && entry.resource_id ? (
                  <Button
                    render={<Link href={`${props.envPath}/email/messages/${entry.resource_id}`} />}
                    size="xs"
                    variant="outline"
                  >
                    View email
                  </Button>
                ) : null}
                {typeof attributes.endpoint_id === "string" ? (
                  <Button
                    render={
                      <Link
                        href={`${props.envPath}/developers/webhooks/${attributes.endpoint_id}`}
                      />
                    }
                    size="xs"
                    variant="outline"
                  >
                    View endpoint
                  </Button>
                ) : null}
              </div>
              <Tabs defaultValue="overview">
                <TabsList variant="underline">
                  <TabsTab value="overview">Overview</TabsTab>
                  {isRequest ? <TabsTab value="request">Request</TabsTab> : null}
                  {isRequest ? <TabsTab value="response">Response</TabsTab> : null}
                  {!isRequest ? <TabsTab value="details">Details</TabsTab> : null}
                  <TabsTab value="timeline">
                    Timeline
                    {detail && detail.related.length > 1 ? (
                      <span className="ms-1 text-muted-foreground text-xs">
                        {detail.related.length}
                      </span>
                    ) : null}
                  </TabsTab>
                </TabsList>
                <TabsPanel className="pt-2" value="overview">
                  <dl>
                    <Field copy={entry.id} label="Log id" value={<code>{entry.id}</code>} />
                    <Field label="Type" value={<code>{entry.type}</code>} />
                    <Field
                      label="Status"
                      value={
                        entry.status_code === null ? null : (
                          <span className={`font-mono ${statusClassName(entry.status_code)}`}>
                            {entry.status_code}
                          </span>
                        )
                      }
                    />
                    <Field label="Method" value={entry.method} />
                    <Field copy={entry.path} label="Path" value={<code>{entry.path}</code>} />
                    <Field label="Route" value={entry.route ? <code>{entry.route}</code> : null} />
                    <Field label="Duration" value={formatDuration(entry.duration_ms)} />
                    <Field
                      label="Error code"
                      value={entry.error_code ? <code>{entry.error_code}</code> : null}
                    />
                    <Field
                      copy={entry.request_id}
                      label="Request id"
                      value={entry.request_id ? <code>{entry.request_id}</code> : null}
                    />
                    <Field
                      copy={entry.api_key_id}
                      label="API key"
                      value={
                        entry.api_key_id ? (
                          <span>
                            {keyName ? `${keyName} · ` : ""}
                            <code className="text-xs">{entry.api_key_id}</code>
                          </span>
                        ) : null
                      }
                    />
                    <Field
                      copy={entry.resource_id}
                      label={entry.resource_type ? `Resource (${entry.resource_type})` : "Resource"}
                      value={entry.resource_id ? <code>{entry.resource_id}</code> : null}
                    />
                    <Field copy={entry.recipient} label="Recipient" value={entry.recipient} />
                    <Field label="Client IP" value={entry.client_ip} />
                    <Field label="User agent" value={entry.user_agent} />
                  </dl>
                </TabsPanel>
                {isRequest ? (
                  <TabsPanel className="flex flex-col gap-3 pt-2" value="request">
                    {attributes.request?.query ? (
                      <Field label="Query" value={<code>?{attributes.request.query}</code>} />
                    ) : null}
                    <h3 className="font-medium text-sm">Headers</h3>
                    <Json value={attributes.request?.headers} />
                    <h3 className="font-medium text-sm">Body</h3>
                    <Json value={attributes.request?.body} />
                  </TabsPanel>
                ) : null}
                {isRequest ? (
                  <TabsPanel className="flex flex-col gap-3 pt-2" value="response">
                    <h3 className="font-medium text-sm">Headers</h3>
                    <Json value={attributes.response?.headers} />
                    <h3 className="font-medium text-sm">Body</h3>
                    <Json value={attributes.response?.body} />
                  </TabsPanel>
                ) : null}
                {!isRequest ? (
                  <TabsPanel className="pt-2" value="details">
                    <Json value={entry.attributes} />
                  </TabsPanel>
                ) : null}
                <TabsPanel className="pt-2" value="timeline">
                  {!detail ? (
                    failed ? (
                      <p className="text-muted-foreground text-sm">Couldn't load the timeline.</p>
                    ) : (
                      <Spinner />
                    )
                  ) : detail.related.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      This line has no request or resource to follow.
                    </p>
                  ) : (
                    <ol className="relative flex flex-col border-s ps-4">
                      {detail.related.map((line) => (
                        <li className="relative py-1.5" key={line.id}>
                          <span
                            className={`absolute -start-[1.3rem] top-3 size-2.5 rounded-full ring-2 ring-popover ${LEVEL_DOT[line.level]}`}
                          />
                          <button
                            className={`w-full rounded-md px-2 py-1 text-left hover:bg-accent/50 ${line.id === entry.id ? "bg-accent" : ""}`}
                            onClick={() => props.onSelect(line)}
                            type="button"
                          >
                            <div className="truncate font-mono text-sm">{line.message}</div>
                            <div className="font-mono text-muted-foreground text-xs">
                              {logTimestamp(line.occurred_at)} · {line.type}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsPanel>
              </Tabs>
            </SheetPanel>
          </>
        ) : (
          <SheetPanel>
            {failed ? (
              <p className="text-muted-foreground text-sm">
                This log line doesn't exist or has expired.
              </p>
            ) : (
              <Spinner />
            )}
          </SheetPanel>
        )}
      </SheetPopup>
    </Sheet>
  );
}
