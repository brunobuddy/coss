"use client";

import type { TemplateVariable } from "@coss/email/templates";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coss/ui/components/alert-dialog";
import { Button } from "@coss/ui/components/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { useActionState, useState } from "react";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody } from "@/components/panel";
import { SpecItem, SpecList } from "@/components/spec-list";
import { restoreVersionAction } from "../../../actions";
import { type PreviewContent, TemplatePreview } from "../../../template-preview";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; templateId: string };

/** A published version, read-only: its preview per locale, its variables, and Restore. */
export function VersionView(props: {
  target: Target;
  version: number;
  defaultLocale: string;
  variables: TemplateVariable[];
  sample: Record<string, unknown>;
  contents: (PreviewContent & { locale: string })[];
  canRestore: boolean;
}) {
  const [locale, setLocale] = useState(props.defaultLocale);
  const content = props.contents.find((candidate) => candidate.locale === locale) ?? null;
  const items = props.contents.map((candidate) => ({
    value: candidate.locale,
    label:
      candidate.locale === props.defaultLocale ? `${candidate.locale} (default)` : candidate.locale,
  }));

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Panel
        action={
          <Select items={items} onValueChange={(value) => setLocale(String(value))} value={locale}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
        title="Preview"
      >
        <PanelBody>
          <TemplatePreview content={content} sample={props.sample} variables={props.variables} />
        </PanelBody>
      </Panel>
      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Variables">
          <PanelBody flush>
            <SpecList>
              {props.variables.length === 0 ? (
                <SpecItem label="None">—</SpecItem>
              ) : (
                props.variables.map((variable) => (
                  <SpecItem key={variable.name} label={variable.name} mono>
                    {variable.type}
                    {variable.type === "list"
                      ? ` of { ${(variable.fields ?? []).map((field) => `${field.name}: ${field.type}`).join(", ")} }`
                      : ""}
                    {variable.required ? "" : " (optional)"}
                    {variable.default === undefined ? "" : ` = ${JSON.stringify(variable.default)}`}
                  </SpecItem>
                ))
              )}
            </SpecList>
          </PanelBody>
        </Panel>
        {props.canRestore ? <RestoreButton target={props.target} version={props.version} /> : null}
      </div>
    </div>
  );
}

function RestoreButton(props: { target: Target; version: number }) {
  // On success the action redirects to the editor.
  const [state, formAction, pending] = useActionState(restoreVersionAction, null);
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" />}>
        Restore to draft
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <input name="orgSlug" type="hidden" value={props.target.orgSlug} />
          <input name="projectSlug" type="hidden" value={props.target.projectSlug} />
          <input name="envSlug" type="hidden" value={props.target.envSlug} />
          <input name="templateId" type="hidden" value={props.target.templateId} />
          <input name="version" type="hidden" value={props.version} />
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {props.version}?</AlertDialogTitle>
            <AlertDialogDescription>
              It replaces the current draft, including unpublished changes. Sends are unaffected
              until you publish.
            </AlertDialogDescription>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit">
              Restore
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
