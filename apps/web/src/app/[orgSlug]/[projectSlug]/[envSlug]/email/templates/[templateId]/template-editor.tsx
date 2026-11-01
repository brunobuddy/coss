"use client";

import {
  canonicalLocale,
  checkTemplateContents,
  MAX_TEMPLATE_LIST_FIELDS,
  MAX_TEMPLATE_LOCALES,
  MAX_TEMPLATE_VARIABLES,
  TEMPLATE_SCALAR_TYPES,
  TEMPLATE_VARIABLE_TYPES,
  type TemplateScalarType,
  type TemplateVariable,
  type TemplateVariableType,
} from "@coss/email/templates";
import { Alert, AlertAction, AlertDescription } from "@coss/ui/components/alert";
import { Badge } from "@coss/ui/components/badge";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { Textarea } from "@coss/ui/components/textarea";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody } from "@/components/panel";
import { saveDraftAction } from "../actions";
import { TemplatePreview } from "../template-preview";
import { PublishButton } from "./publish-button";
import { TestSendDialog } from "./test-send-dialog";

type Target = { orgSlug: string; projectSlug: string; envSlug: string; templateId: string };

export type EditorContent = {
  locale: string;
  subject: string;
  html: string | null;
  text: string | null;
};

type FieldDraft = { name: string; type: TemplateScalarType; required: boolean };

/** A variable as edited: the default as typed (`null`: none). */
type VariableDraft = {
  name: string;
  type: TemplateVariableType;
  required: boolean;
  default: string | null;
  description: string;
  fields: FieldDraft[];
};

export type EditorDraft = {
  revision: number;
  defaultLocale: string;
  variables: TemplateVariable[];
  sampleVariables: Record<string, unknown>;
  contents: EditorContent[];
};

function toVariableDraft(variable: TemplateVariable): VariableDraft {
  return {
    name: variable.name,
    type: variable.type,
    required: variable.required,
    default: variable.default === undefined ? null : String(variable.default),
    description: variable.description ?? "",
    fields: variable.fields ?? [],
  };
}

/** The wire declaration (and what checking and previews use). */
function fromVariableDraft(draft: VariableDraft): TemplateVariable {
  const defaultValue =
    draft.type === "list" || draft.default === null
      ? undefined
      : draft.type === "number"
        ? Number(draft.default)
        : draft.type === "boolean"
          ? draft.default === "true"
          : draft.default;
  return {
    name: draft.name.trim(),
    type: draft.type,
    required: draft.required,
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.type === "list" ? { fields: draft.fields } : {}),
  };
}

/** Unsaved edits, kept in this tab until they are saved, discarded or the draft moves on. */
type StoredEdits = {
  revision: number;
  defaultLocale: string;
  contents: EditorContent[];
  variables: VariableDraft[];
  sampleText: string;
};

function storageKey(templateId: string): string {
  return `coss:template-edits:${templateId}`;
}

// Session storage can be missing or full (a private window, 30 locales of large HTML): the edits
// are then only kept while the page is open, as before.
function readStoredEdits(templateId: string): StoredEdits | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(templateId));
    return raw ? (JSON.parse(raw) as StoredEdits) : null;
  } catch {
    return null;
  }
}

function writeStoredEdits(templateId: string, edits: StoredEdits | null) {
  try {
    if (edits) window.sessionStorage.setItem(storageKey(templateId), JSON.stringify(edits));
    else window.sessionStorage.removeItem(storageKey(templateId));
  } catch {
    // Best effort.
  }
}

/** Example values for the declared variables, for an empty sample. */
function sampleSkeleton(variables: TemplateVariable[]): Record<string, unknown> {
  const example = (type: string, name: string) =>
    type === "number" ? 1 : type === "boolean" ? true : name.replaceAll("_", " ");
  return Object.fromEntries(
    variables.map((variable) => [
      variable.name,
      variable.type === "list"
        ? [
            Object.fromEntries(
              (variable.fields ?? []).map((field) => [field.name, example(field.type, field.name)]),
            ),
          ]
        : (variable.default ?? example(variable.type, variable.name)),
    ]),
  );
}

const TYPE_ITEMS = TEMPLATE_VARIABLE_TYPES.map((value) => ({ value, label: value }));
const SCALAR_ITEMS = TEMPLATE_SCALAR_TYPES.map((value) => ({ value, label: value }));

export function TemplateEditor(props: {
  target: Target;
  draft: EditorDraft;
  canUpdate: boolean;
  canPublish: boolean;
  canSend: boolean;
  testSend: { recipients: string[]; currentUserEmail: string; from: string; sandbox: boolean };
  emailsPath: string;
}) {
  const readOnly = !props.canUpdate;
  const [defaultLocale, setDefaultLocale] = useState(props.draft.defaultLocale);
  const [contents, setContents] = useState<EditorContent[]>(props.draft.contents);
  const [variables, setVariables] = useState<VariableDraft[]>(
    props.draft.variables.map(toVariableDraft),
  );
  const [sampleText, setSampleText] = useState(
    JSON.stringify(props.draft.sampleVariables, null, 2),
  );
  const [locale, setLocale] = useState(
    props.draft.contents.some((content) => content.locale === props.draft.defaultLocale)
      ? props.draft.defaultLocale
      : (props.draft.contents[0]?.locale ?? ""),
  );
  const [newLocale, setNewLocale] = useState("");
  const [localeError, setLocaleError] = useState<string | null>(null);

  const declarations = useMemo(() => variables.map(fromVariableDraft), [variables]);
  const sample = useMemo((): { values: Record<string, unknown>; error: string | null } => {
    try {
      const value: unknown = JSON.parse(sampleText || "{}");
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { values: {}, error: "Sample values must be a JSON object." };
      }
      return { values: value as Record<string, unknown>, error: null };
    } catch {
      return { values: {}, error: "Sample values aren't valid JSON." };
    }
  }, [sampleText]);
  const problems = useMemo(
    () => checkTemplateContents(contents, declarations),
    [contents, declarations],
  );

  const payload = JSON.stringify({
    default_locale: defaultLocale,
    variables: declarations,
    sample_variables: sample.values,
    contents,
  });
  const [saved, setSaved] = useState({ revision: props.draft.revision, payload });
  const submitted = useRef(payload);
  const [state, formAction, pending] = useActionState(saveDraftAction, null);
  useEffect(() => {
    if (state?.ok) setSaved({ revision: state.data.revision, payload: submitted.current });
  }, [state]);
  const dirty = payload !== saved.payload;

  // Closing or reloading the tab with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Navigating inside the dashboard (links, ⌘K, back) fires no `beforeunload`: unsaved edits are
  // kept in this tab instead and come back when the template is opened again, as long as the
  // draft is still at the revision they started from.
  const templateId = props.target.templateId;
  const initialRevision = props.draft.revision;
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const stored = readStoredEdits(templateId);
    if (!stored) return;
    if (stored.revision !== initialRevision) {
      writeStoredEdits(templateId, null);
      return;
    }
    setDefaultLocale(stored.defaultLocale);
    setContents(stored.contents);
    setVariables(stored.variables);
    setSampleText(stored.sampleText);
    setLocale(
      stored.contents.some((content) => content.locale === stored.defaultLocale)
        ? stored.defaultLocale
        : (stored.contents[0]?.locale ?? ""),
    );
    setRestored(true);
  }, [templateId, initialRevision]);
  const storing = useRef(false);
  useEffect(() => {
    // The first run sees the server's draft, before any restore: nothing to store or clear yet.
    if (!storing.current) {
      storing.current = true;
      return;
    }
    if (!dirty) {
      writeStoredEdits(templateId, null);
      return;
    }
    const timer = setTimeout(
      () =>
        writeStoredEdits(templateId, {
          revision: saved.revision,
          defaultLocale,
          contents,
          variables,
          sampleText,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [templateId, dirty, saved.revision, defaultLocale, contents, variables, sampleText]);
  const discardRestored = () => {
    writeStoredEdits(templateId, null);
    setDefaultLocale(props.draft.defaultLocale);
    setContents(props.draft.contents);
    setVariables(props.draft.variables.map(toVariableDraft));
    setSampleText(JSON.stringify(props.draft.sampleVariables, null, 2));
    setLocale(
      props.draft.contents.some((content) => content.locale === props.draft.defaultLocale)
        ? props.draft.defaultLocale
        : (props.draft.contents[0]?.locale ?? ""),
    );
    setRestored(false);
  };

  const current = contents.find((content) => content.locale === locale) ?? null;
  const updateContent = (change: Partial<EditorContent>) =>
    setContents((all) =>
      all.map((content) => (content.locale === locale ? { ...content, ...change } : content)),
    );
  const updateVariable = (index: number, change: Partial<VariableDraft>) =>
    setVariables((all) =>
      all.map((variable, i) => (i === index ? { ...variable, ...change } : variable)),
    );

  const addLocale = () => {
    const canonical = canonicalLocale(newLocale.trim());
    if (!canonical) {
      setLocaleError('Enter a BCP 47 language tag, e.g. "de" or "pt-BR".');
      return;
    }
    if (contents.some((content) => content.locale.toLowerCase() === canonical.toLowerCase())) {
      setLocaleError(`"${canonical}" is already there.`);
      return;
    }
    // A new locale starts as a copy of the one being edited, to translate.
    const source = current ?? { subject: "", html: "", text: null };
    setContents((all) =>
      [...all, { ...source, locale: canonical }].sort((a, b) => a.locale.localeCompare(b.locale)),
    );
    if (contents.length === 0) setDefaultLocale(canonical);
    setLocale(canonical);
    setNewLocale("");
    setLocaleError(null);
  };

  const removeLocale = () => {
    const rest = contents.filter((content) => content.locale !== locale);
    setContents(rest);
    const next = rest.find((content) => content.locale === defaultLocale) ?? rest[0];
    if (locale === defaultLocale && next) setDefaultLocale(next.locale);
    setLocale(next?.locale ?? "");
  };

  const localeItems = contents.map((content) => ({
    value: content.locale,
    label: content.locale === defaultLocale ? `${content.locale} (default)` : content.locale,
  }));
  const blocked = dirty
    ? "Save the draft first."
    : problems.length > 0
      ? "Fix the problems first."
      : null;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <Panel
          action={
            <div className="flex flex-wrap items-center gap-2">
              {dirty ? <Badge variant="warning">Unsaved</Badge> : null}
              {props.canUpdate ? (
                <form
                  action={formAction}
                  onSubmit={() => {
                    submitted.current = payload;
                  }}
                >
                  <input name="orgSlug" type="hidden" value={props.target.orgSlug} />
                  <input name="projectSlug" type="hidden" value={props.target.projectSlug} />
                  <input name="envSlug" type="hidden" value={props.target.envSlug} />
                  <input name="templateId" type="hidden" value={props.target.templateId} />
                  <input
                    name="draft"
                    type="hidden"
                    value={JSON.stringify({ revision: saved.revision, ...JSON.parse(payload) })}
                  />
                  <Button
                    disabled={!dirty || sample.error !== null}
                    loading={pending}
                    size="sm"
                    type="submit"
                    variant="outline"
                  >
                    Save draft
                  </Button>
                </form>
              ) : null}
              {props.canSend ? (
                <TestSendDialog
                  {...props.testSend}
                  blocked={dirty ? "Save the draft first." : null}
                  emailsPath={props.emailsPath}
                  locales={contents.map((content) => content.locale)}
                  revision={saved.revision}
                  sample={sample.values}
                  target={props.target}
                />
              ) : null}
              {props.canPublish ? (
                <PublishButton blocked={blocked} revision={saved.revision} target={props.target} />
              ) : null}
            </div>
          }
          description={`Revision ${saved.revision}`}
          title="Draft"
        >
          <PanelBody className="flex flex-col gap-5">
            {restored && dirty ? (
              <Alert variant="info">
                <AlertDescription>
                  Unsaved changes from earlier in this tab were restored.
                </AlertDescription>
                <AlertAction>
                  <Button onClick={discardRestored} size="xs" type="button" variant="outline">
                    Discard
                  </Button>
                </AlertAction>
              </Alert>
            ) : null}
            {state && !state.ok ? <FormError message={state.error} /> : null}
            <div className="flex flex-wrap items-end gap-3">
              <Field className="w-48">
                <FieldLabel>Locale</FieldLabel>
                <Select
                  disabled={contents.length === 0}
                  items={localeItems}
                  onValueChange={(value) => setLocale(String(value))}
                  value={locale}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {localeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              {!readOnly && current && locale !== defaultLocale ? (
                <>
                  <Button
                    onClick={() => setDefaultLocale(locale)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Make default
                  </Button>
                  <Button onClick={removeLocale} size="sm" type="button" variant="ghost">
                    Remove {locale}
                  </Button>
                </>
              ) : null}
              {!readOnly && contents.length < MAX_TEMPLATE_LOCALES ? (
                <div className="ms-auto flex items-end gap-2">
                  <Field className="w-32">
                    <FieldLabel>Add locale</FieldLabel>
                    <Input
                      className="font-mono"
                      onChange={(event) => setNewLocale(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLocale();
                        }
                      }}
                      placeholder="de"
                      value={newLocale}
                    />
                  </Field>
                  <Button onClick={addLocale} size="sm" type="button" variant="outline">
                    Add
                  </Button>
                </div>
              ) : null}
            </div>
            {localeError ? <FormError message={localeError} /> : null}

            {current ? (
              <>
                <Field>
                  <FieldLabel>Subject</FieldLabel>
                  <Input
                    className="font-mono"
                    onChange={(event) => updateContent({ subject: event.target.value })}
                    readOnly={readOnly}
                    spellCheck={false}
                    value={current.subject}
                  />
                </Field>
                <Tabs className="gap-3" defaultValue="html">
                  <TabsList variant="underline">
                    <TabsTab value="html">HTML</TabsTab>
                    <TabsTab value="text">Text</TabsTab>
                  </TabsList>
                  <TabsPanel value="html">
                    <Textarea
                      aria-label="HTML"
                      className="min-h-80 font-mono text-xs"
                      onChange={(event) => updateContent({ html: event.target.value || null })}
                      placeholder="<p>Hi {{first_name}},</p>"
                      readOnly={readOnly}
                      spellCheck={false}
                      value={current.html ?? ""}
                    />
                  </TabsPanel>
                  <TabsPanel value="text">
                    <Textarea
                      aria-label="Text"
                      className="min-h-80 font-mono text-xs"
                      onChange={(event) => updateContent({ text: event.target.value || null })}
                      placeholder="Hi {{first_name}},"
                      readOnly={readOnly}
                      spellCheck={false}
                      value={current.text ?? ""}
                    />
                  </TabsPanel>
                </Tabs>
                <p className="text-muted-foreground text-xs">
                  <code>{"{{name}}"}</code> inserts a variable (escaped in HTML),{" "}
                  <code>{"{{{name}}}"}</code> raw HTML,{" "}
                  <code>{"{{#if name}}…{{else}}…{{/if}}"}</code> a condition,{" "}
                  <code>{"{{#each list}}…{{/each}}"}</code> a loop over a list's items.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Add a locale to write the template.</p>
            )}
          </PanelBody>
        </Panel>

        {problems.length > 0 ? (
          <Panel
            description="These keep the draft from being published and from test sends."
            title="Problems"
          >
            <PanelBody>
              <ul className="flex flex-col gap-1.5 text-sm">
                {problems.map((problem) => (
                  <li
                    key={`${problem.locale}:${problem.field}:${problem.line}:${problem.column}:${problem.message}`}
                  >
                    <span className="font-mono text-muted-foreground text-xs">
                      {problem.locale} · {problem.field} · {problem.line}:{problem.column}
                    </span>{" "}
                    {problem.message}
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel
          description="Sends must pass the required ones (unless they have a default). Unknown names are refused."
          title="Variables"
        >
          <PanelBody className="flex flex-col gap-4">
            {variables.length === 0 ? (
              <p className="text-muted-foreground text-sm">No variables yet.</p>
            ) : null}
            {variables.map((variable, index) => (
              // Variables are edited in place; their position is their identity while editing.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              <div className="flex flex-col gap-2 rounded-lg border p-3" key={index}>
                <div className="flex flex-wrap items-end gap-2">
                  <Field className="w-44">
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      className="font-mono"
                      onChange={(event) => updateVariable(index, { name: event.target.value })}
                      readOnly={readOnly}
                      spellCheck={false}
                      value={variable.name}
                    />
                  </Field>
                  <Field className="w-32">
                    <FieldLabel>Type</FieldLabel>
                    <Select
                      disabled={readOnly}
                      items={TYPE_ITEMS}
                      onValueChange={(value) =>
                        updateVariable(index, {
                          type: value as TemplateVariableType,
                          default: null,
                          fields:
                            value === "list" && variable.fields.length === 0
                              ? [{ name: "name", type: "string", required: true }]
                              : variable.fields,
                        })
                      }
                      value={variable.type}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {TYPE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </Field>
                  {variable.type !== "list" ? (
                    <Field className="w-36">
                      <FieldLabel>Default</FieldLabel>
                      <Input
                        // Clearing the field removes the default. An empty string default (set over
                        // the API) is kept as is until it's edited.
                        onChange={(event) =>
                          updateVariable(index, { default: event.target.value || null })
                        }
                        placeholder={
                          variable.default === ""
                            ? "empty string"
                            : variable.type === "boolean"
                              ? "true / false"
                              : "none"
                        }
                        readOnly={readOnly}
                        value={variable.default ?? ""}
                      />
                    </Field>
                  ) : null}
                  <Label className="mb-2 gap-2">
                    <Checkbox
                      checked={variable.required}
                      disabled={readOnly}
                      onCheckedChange={(checked) => updateVariable(index, { required: checked })}
                    />
                    Required
                  </Label>
                  {readOnly ? null : (
                    <Button
                      className="ms-auto"
                      onClick={() => setVariables((all) => all.filter((_, i) => i !== index))}
                      size="xs"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <Input
                  aria-label="Description"
                  onChange={(event) => updateVariable(index, { description: event.target.value })}
                  placeholder="Description (optional)"
                  readOnly={readOnly}
                  value={variable.description}
                />
                {variable.type === "list" ? (
                  <ListFields
                    fields={variable.fields}
                    onChange={(fields) => updateVariable(index, { fields })}
                    readOnly={readOnly}
                  />
                ) : null}
              </div>
            ))}
            {!readOnly && variables.length < MAX_TEMPLATE_VARIABLES ? (
              <div>
                <Button
                  onClick={() =>
                    setVariables((all) => [
                      ...all,
                      {
                        name: "",
                        type: "string",
                        required: true,
                        default: null,
                        description: "",
                        fields: [],
                      },
                    ])
                  }
                  size="xs"
                  type="button"
                  variant="outline"
                >
                  Add variable
                </Button>
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-20">
        <Panel
          description="Rendered with the sample values, exactly as a send would be."
          title="Preview"
        >
          <PanelBody>
            <TemplatePreview content={current} sample={sample.values} variables={declarations} />
          </PanelBody>
        </Panel>
        <Panel
          action={
            readOnly ? null : (
              <Button
                onClick={() => setSampleText(JSON.stringify(sampleSkeleton(declarations), null, 2))}
                size="xs"
                type="button"
                variant="outline"
              >
                Fill from variables
              </Button>
            )
          }
          description="JSON, as you would pass `variables`. Used by the preview and test sends."
          title="Sample values"
        >
          <PanelBody className="flex flex-col gap-2">
            <Field>
              <Textarea
                aria-label="Sample values"
                className="min-h-40 font-mono text-xs"
                onChange={(event) => setSampleText(event.target.value)}
                readOnly={readOnly}
                spellCheck={false}
                value={sampleText}
              />
              {sample.error ? <FieldDescription>{sample.error}</FieldDescription> : null}
            </Field>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function ListFields(props: {
  fields: FieldDraft[];
  onChange: (fields: FieldDraft[]) => void;
  readOnly: boolean;
}) {
  const update = (index: number, change: Partial<FieldDraft>) =>
    props.onChange(props.fields.map((field, i) => (i === index ? { ...field, ...change } : field)));
  return (
    <div className="flex flex-col gap-2 border-s ps-3">
      <span className="text-muted-foreground text-xs">Item fields</span>
      {props.fields.map((field, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: edited in place, like variables
        <div className="flex flex-wrap items-center gap-2" key={index}>
          <Input
            aria-label="Field name"
            className="w-40 font-mono"
            onChange={(event) => update(index, { name: event.target.value })}
            readOnly={props.readOnly}
            spellCheck={false}
            value={field.name}
          />
          <Select
            disabled={props.readOnly}
            items={SCALAR_ITEMS}
            onValueChange={(value) => update(index, { type: value as TemplateScalarType })}
            value={field.type}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {SCALAR_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Label className="gap-2">
            <Checkbox
              checked={field.required}
              disabled={props.readOnly}
              onCheckedChange={(checked) => update(index, { required: checked })}
            />
            Required
          </Label>
          {props.readOnly || props.fields.length === 1 ? null : (
            <Button
              onClick={() => props.onChange(props.fields.filter((_, i) => i !== index))}
              size="xs"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {!props.readOnly && props.fields.length < MAX_TEMPLATE_LIST_FIELDS ? (
        <div>
          <Button
            onClick={() =>
              props.onChange([...props.fields, { name: "", type: "string", required: true }])
            }
            size="xs"
            type="button"
            variant="ghost"
          >
            Add field
          </Button>
        </div>
      ) : null}
    </div>
  );
}
