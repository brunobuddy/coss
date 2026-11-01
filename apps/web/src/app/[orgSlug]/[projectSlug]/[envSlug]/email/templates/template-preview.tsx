"use client";

import {
  parseTemplate,
  renderableValues,
  renderTemplate,
  type TemplateField,
  TemplateRenderError,
  type TemplateValues,
  type TemplateVariable,
  validateTemplateVariables,
} from "@coss/email/templates";
import { Button } from "@coss/ui/components/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { cn } from "@coss/ui/lib/utils";
import { useDeferredValue, useMemo, useState } from "react";
import { PREVIEW_HEAD } from "@/lib/email-preview";

export type PreviewContent = { subject: string; html: string | null; text: string | null };

type Rendered = { ok: true; value: string } | { ok: false; message: string };

function renderField(
  field: TemplateField,
  source: string,
  values: TemplateValues,
  variables: readonly TemplateVariable[],
): Rendered {
  const parsed = parseTemplate(source);
  if (!parsed.ok) {
    const { message, line, column } = parsed.problem;
    return { ok: false, message: `Line ${line}, column ${column}: ${message}` };
  }
  try {
    return { ok: true, value: renderTemplate(parsed.nodes, values, { field, variables }) };
  } catch (error) {
    if (error instanceof TemplateRenderError) return { ok: false, message: error.message };
    throw error;
  }
}

/**
 * One locale of a template rendered with sample values, as the server would render it at send
 * time (same code: `@coss/email/templates`). The HTML is shown in a sandboxed iframe that runs no
 * scripts and loads nothing but images and fonts.
 */
export function TemplatePreview(props: {
  content: PreviewContent | null;
  variables: TemplateVariable[];
  sample: Record<string, unknown>;
}) {
  // Typing stays responsive: the preview re-renders when React has time.
  const content = useDeferredValue(props.content);
  const sample = useDeferredValue(props.sample);
  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  const { values, issues } = useMemo(() => {
    const validated = validateTemplateVariables(props.variables, sample);
    return validated.ok
      ? { values: validated.values, issues: [] }
      : {
          // Still render what can be of the sample.
          values: renderableValues(sample),
          issues: validated.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        };
  }, [props.variables, sample]);

  const variables = props.variables;
  const rendered = useMemo(
    () =>
      content
        ? {
            subject: renderField("subject", content.subject, values, variables),
            html:
              content.html === null ? null : renderField("html", content.html, values, variables),
            text:
              content.text === null ? null : renderField("text", content.text, values, variables),
          }
        : null,
    [content, values, variables],
  );

  if (!rendered) {
    return <p className="p-4 text-muted-foreground text-sm">Add a locale to preview it.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-3 py-2">
        <span className="text-muted-foreground text-xs">Subject</span>
        {rendered.subject.ok ? (
          <span className="break-words font-medium text-sm">{rendered.subject.value || "—"}</span>
        ) : (
          <span className="text-destructive-foreground text-sm">{rendered.subject.message}</span>
        )}
      </div>
      {issues.length > 0 ? (
        <div className="rounded-lg border border-warning/32 bg-warning/8 px-3 py-2 text-sm">
          <p className="font-medium">The sample values don't match the variables:</p>
          <ul className="mt-1 list-disc ps-5 font-mono text-xs">
            {issues.slice(0, 5).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Tabs className="gap-3" defaultValue={rendered.html ? "html" : "text"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList variant="underline">
            <TabsTab disabled={!rendered.html} value="html">
              HTML
            </TabsTab>
            <TabsTab disabled={!rendered.text} value="text">
              Text
            </TabsTab>
          </TabsList>
          <div className="flex gap-1">
            {(["desktop", "mobile"] as const).map((option) => (
              <Button
                aria-pressed={width === option}
                key={option}
                onClick={() => setWidth(option)}
                size="xs"
                type="button"
                variant={width === option ? "secondary" : "ghost"}
              >
                {option === "desktop" ? "Desktop" : "Mobile"}
              </Button>
            ))}
          </div>
        </div>
        <TabsPanel value="html">
          {rendered.html?.ok ? (
            <div className="flex justify-center rounded-lg border bg-muted/40 p-2">
              <iframe
                className={cn(
                  "h-[560px] rounded-md border bg-white transition-[width]",
                  width === "desktop" ? "w-full" : "w-[375px] max-w-full",
                )}
                referrerPolicy="no-referrer"
                sandbox=""
                srcDoc={PREVIEW_HEAD + rendered.html.value}
                title="Template preview"
              />
            </div>
          ) : rendered.html ? (
            <p className="text-destructive-foreground text-sm">{rendered.html.message}</p>
          ) : null}
        </TabsPanel>
        <TabsPanel value="text">
          {rendered.text?.ok ? (
            <pre
              className={cn(
                "overflow-x-auto whitespace-pre-wrap rounded-lg border bg-background p-3 font-mono text-[0.8125rem] leading-relaxed",
                width === "mobile" && "mx-auto w-[375px] max-w-full",
              )}
            >
              {rendered.text.value}
            </pre>
          ) : rendered.text ? (
            <p className="text-destructive-foreground text-sm">{rendered.text.message}</p>
          ) : null}
        </TabsPanel>
      </Tabs>
    </div>
  );
}
