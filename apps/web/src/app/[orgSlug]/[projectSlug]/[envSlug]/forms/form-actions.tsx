"use client";

import { FORM_CHOICE_FIELD_TYPES, FORM_FIELD_TYPES, type FormFieldType } from "@coss/forms/schemas";
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
import { Checkbox } from "@coss/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@coss/ui/components/dialog";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Radio, RadioGroup } from "@coss/ui/components/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@coss/ui/components/select";
import { Textarea } from "@coss/ui/components/textarea";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { FormError } from "@/components/form-error";
import { useActionToast } from "@/lib/toast";
import {
  createFormAction,
  deleteFormAction,
  deleteSubmissionAction,
  releaseSubmissionAction,
  saveFormFieldsAction,
  saveFormSettingsAction,
} from "./actions";

export type EnvTarget = { orgSlug: string; projectSlug: string; envSlug: string };

function Hidden(props: EnvTarget & { formId?: string; submissionId?: string }) {
  return (
    <>
      {Object.entries(props).map(([name, value]) =>
        value ? <input key={name} name={name} type="hidden" value={value} /> : null,
      )}
    </>
  );
}

export function NewFormDialog(props: EnvTarget) {
  const [state, formAction, pending] = useActionToast(createFormAction, {
    success: "Form created",
  });
  return (
    <Dialog>
      <DialogTrigger render={<Button size="sm" />}>New form</DialogTrigger>
      <DialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <DialogHeader>
            <DialogTitle>New form</DialogTitle>
            <DialogDescription>
              An endpoint your site's forms post to. Add fields and a hosted page next, or post any
              fields to it as they are.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input autoFocus maxLength={100} name="name" placeholder="Contact us" required />
            </Field>
            {state && !state.ok ? <FormError message={state.error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button loading={pending} type="submit">
              Create form
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

export function DeleteFormButton(props: EnvTarget & { formId: string; name: string }) {
  const [state, formAction, pending] = useActionToast(deleteFormAction, {
    success: "Form deleted",
  });
  const { name, ...target } = props;
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete form
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...target} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every submission and uploaded file goes with it, and its endpoint stops accepting
              posts. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export function ReleaseButton(props: EnvTarget & { formId: string; submissionId: string }) {
  const [, formAction, pending] = useActionToast(releaseSubmissionAction, {
    success: "Submission released",
    errors: "toast",
  });
  return (
    <form action={formAction}>
      <Hidden {...props} />
      <Button loading={pending} size="sm" type="submit">
        Not spam: deliver it
      </Button>
    </form>
  );
}

export function DeleteSubmissionButton(
  props: EnvTarget & { formId: string; submissionId: string },
) {
  const [state, formAction, pending] = useActionToast(deleteSubmissionAction, {
    success: "Submission deleted",
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="destructive-outline" />}>
        Delete
      </AlertDialogTrigger>
      <AlertDialogPopup>
        <form action={formAction} className="contents">
          <Hidden {...props} />
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              Its data and files are deleted. Webhooks and emails already sent aren't recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {state && !state.ok ? <FormError message={state.error} /> : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <Button loading={pending} type="submit" variant="destructive">
              Delete
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

export type SettingsValues = {
  name: string;
  enabled: boolean;
  strictFields: boolean;
  allowedOrigins: string[];
  redirectUrl: string | null;
  honeypotField: string;
  captcha: "off" | "required";
  captchaSiteKey: string | null;
  contentThreshold: number | null;
  onReview: "deliver" | "hold";
  emailField: string;
  verify: boolean;
  confirmationFrom: string | null;
  recipients: string[];
  notificationFrom: string | null;
  contacts: {
    enabled: boolean;
    audienceIds: string[];
    topics: string[];
    doubleOptIn: boolean | null;
    firstNameField: string | null;
    lastNameField: string | null;
  };
  files: { enabled: boolean; maxFiles: number; maxFileBytes: number; allowedTypes: string[] };
};

function Section(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 border-t pt-6 first:border-t-0 first:pt-0">
      <legend className="mb-1 font-semibold">{props.title}</legend>
      {props.description ? (
        <p className="-mt-2 text-muted-foreground text-sm">{props.description}</p>
      ) : null}
      {props.children}
    </fieldset>
  );
}

function Choice(props: { name: string; value: string; items: { value: string; label: string }[] }) {
  return (
    <Select defaultValue={props.value} items={props.items} name={props.name}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {props.items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

export function FormSettingsForm(
  props: EnvTarget & {
    formId: string;
    sandbox: boolean;
    values: SettingsValues;
    audiences: { id: string; name: string }[];
    topics: { key: string; name: string }[];
    captchaConfigured: boolean;
  },
) {
  const [state, formAction, pending] = useActionToast(saveFormSettingsAction, {
    success: "Form saved",
  });
  const { values, sandbox, audiences, topics, captchaConfigured, ...target } = props;
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Hidden {...target} />
      <Section title="Form">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input defaultValue={values.name} maxLength={100} name="name" required />
        </Field>
        <Label className="gap-3">
          <Checkbox defaultChecked={values.enabled} name="enabled" />
          Accepting submissions
        </Label>
        <Field>
          <FieldLabel>Sites allowed to post</FieldLabel>
          <Textarea
            className="font-mono text-xs"
            defaultValue={values.allowedOrigins.join("\n")}
            name="allowedOrigins"
            placeholder="https://www.example.com"
            rows={3}
          />
          <FieldDescription>
            One origin per line (https://, no path{sandbox ? "; http://localhost works here" : ""}
            ). Empty: any site. Hosted pages can be framed only by these.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>After a submission, go to</FieldLabel>
          <Input
            defaultValue={values.redirectUrl ?? ""}
            name="redirectUrl"
            placeholder="https://www.example.com/thanks"
            type="url"
          />
          <FieldDescription>
            Empty: coss.com's thank-you page. A post's <code className="font-mono">_next</code>{" "}
            field wins when it points at an allowed site.
          </FieldDescription>
        </Field>
        <Label className="gap-3">
          <Checkbox defaultChecked={values.strictFields} name="strictFields" />
          Refuse fields the form doesn't define (when it has fields)
        </Label>
      </Section>

      <Section
        description="Every submission is assessed by Risk in this environment: email, IP, device, velocity and the text."
        title="Spam"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Honeypot field</FieldLabel>
            <Input className="font-mono" defaultValue={values.honeypotField} name="honeypotField" />
            <FieldDescription>Hide it with CSS; a bot that fills it is spam.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Content threshold</FieldLabel>
            <Input
              defaultValue={values.contentThreshold ?? ""}
              max={1}
              min={0.5}
              name="contentThreshold"
              placeholder="Off"
              step={0.01}
              type="number"
            />
            <FieldDescription>
              Text scoring this high as spam, phishing, malware or fraud is spam. Empty: off.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>When Risk asks for a review</FieldLabel>
            <Choice
              items={[
                { value: "hold", label: "Hold it until someone releases it" },
                { value: "deliver", label: "Deliver it anyway" },
              ]}
              name="onReview"
              value={values.onReview}
            />
          </Field>
          <Field>
            <FieldLabel>Captcha</FieldLabel>
            <Choice
              items={[
                { value: "off", label: "Off" },
                { value: "required", label: "Required" },
              ]}
              name="captcha"
              value={values.captcha}
            />
            <FieldDescription>
              {captchaConfigured
                ? "Verified with the provider set in this environment's risk settings."
                : "Set up Turnstile or hCaptcha in this environment's risk settings first."}
            </FieldDescription>
          </Field>
        </div>
        <Field>
          <FieldLabel>Captcha site key (hosted page)</FieldLabel>
          <Input
            className="font-mono"
            defaultValue={values.captchaSiteKey ?? ""}
            name="captchaSiteKey"
            placeholder="0x4AAAAAAA…"
          />
        </Field>
      </Section>

      <Section
        description="Who hears about accepted submissions. Webhooks get every one too (form.submission.received)."
        title="Notifications"
      >
        <Field>
          <FieldLabel>Email each submission to</FieldLabel>
          <Textarea
            defaultValue={values.recipients.join("\n")}
            name="recipients"
            placeholder="support@yourdomain.com"
            rows={2}
          />
          <FieldDescription>
            Up to five: members of this organization, or addresses on its verified domains. Replies
            go to the submitter.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Notifications come from</FieldLabel>
          <Input
            defaultValue={values.notificationFrom ?? ""}
            name="notificationFrom"
            placeholder="forms@yourdomain.com"
            type="email"
          />
          <FieldDescription>
            An address on a verified domain. Empty: coss.com sends them as “{values.name} via
            coss.com”.
          </FieldDescription>
        </Field>
      </Section>

      <Section title="Submitters">
        <Field>
          <FieldLabel>Email field</FieldLabel>
          <Input className="font-mono" defaultValue={values.emailField} name="emailField" />
          <FieldDescription>The field holding the submitter's address.</FieldDescription>
        </Field>
        <Label className="items-start gap-3">
          <Checkbox className="mt-0.5" defaultChecked={values.verify} name="verify" />
          <span>
            Verify the submitter's email first
            <span className="block text-muted-foreground text-sm">
              Double opt-in for the whole submission: nothing is delivered until they click the
              emailed link.
            </span>
          </span>
        </Label>
        <Field>
          <FieldLabel>Verification emails come from</FieldLabel>
          <Input
            defaultValue={values.confirmationFrom ?? ""}
            name="confirmationFrom"
            placeholder="hello@yourdomain.com"
            type="email"
          />
          <FieldDescription>
            Required to verify in live environments: an address on a verified domain (never
            coss.com's).
          </FieldDescription>
        </Field>
      </Section>

      <Section
        description="Accepted submitters become contacts of this environment (source: form)."
        title="Contacts"
      >
        <Label className="gap-3">
          <Checkbox defaultChecked={values.contacts.enabled} name="contactsEnabled" />
          Add submitters to contacts
        </Label>
        <Field>
          <FieldLabel>Double opt-in</FieldLabel>
          <RadioGroup
            aria-label="Double opt-in"
            defaultValue={
              values.contacts.doubleOptIn === null
                ? "default"
                : values.contacts.doubleOptIn
                  ? "on"
                  : "off"
            }
            name="doubleOptIn"
          >
            {[
              ["default", "The environment's marketing settings decide"],
              ["on", "New contacts confirm by email first"],
              ["off", "Subscribe them directly"],
            ].map(([value, label]) => (
              <Label key={value}>
                <Radio value={value} />
                {label}
              </Label>
            ))}
          </RadioGroup>
        </Field>
        {audiences.length > 0 ? (
          <Field>
            <FieldLabel>Audiences</FieldLabel>
            <div className="flex flex-col gap-2">
              {audiences.map((audience) => (
                <Label className="gap-3" key={audience.id}>
                  <Checkbox
                    defaultChecked={values.contacts.audienceIds.includes(audience.id)}
                    name="audienceIds"
                    value={audience.id}
                  />
                  {audience.name}
                </Label>
              ))}
            </div>
          </Field>
        ) : null}
        {topics.length > 0 ? (
          <Field>
            <FieldLabel>Opt them into topics</FieldLabel>
            <div className="flex flex-col gap-2">
              {topics.map((topic) => (
                <Label className="gap-3" key={topic.key}>
                  <Checkbox
                    defaultChecked={values.contacts.topics.includes(topic.key)}
                    name="topics"
                    value={topic.key}
                  />
                  {topic.name}
                </Label>
              ))}
            </div>
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>First name field</FieldLabel>
            <Input
              className="font-mono"
              defaultValue={values.contacts.firstNameField ?? ""}
              name="firstNameField"
              placeholder="first_name"
            />
          </Field>
          <Field>
            <FieldLabel>Last name field</FieldLabel>
            <Input
              className="font-mono"
              defaultValue={values.contacts.lastNameField ?? ""}
              name="lastNameField"
              placeholder="last_name"
            />
          </Field>
        </div>
      </Section>

      <Section title="File uploads">
        <Label className="gap-3">
          <Checkbox defaultChecked={values.files.enabled} name="filesEnabled" />
          Accept files (multipart/form-data)
        </Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Files per submission</FieldLabel>
            <Input
              defaultValue={values.files.maxFiles}
              max={10}
              min={1}
              name="maxFiles"
              type="number"
            />
          </Field>
          <Field>
            <FieldLabel>Largest file (MB)</FieldLabel>
            <Input
              defaultValue={shownMegabytes(values.files.maxFileBytes)}
              max={10}
              min={0}
              name="maxFileMb"
              step="any"
              type="number"
            />
            {/* Left as shown, the limit keeps its exact bytes (set through the API, say). */}
            <input
              name="maxFileMbShown"
              type="hidden"
              value={shownMegabytes(values.files.maxFileBytes)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Accepted types</FieldLabel>
          <Textarea
            className="font-mono text-xs"
            defaultValue={values.files.allowedTypes.join("\n")}
            name="allowedTypes"
            placeholder="image/*&#10;application/pdf"
            rows={2}
          />
          <FieldDescription>
            MIME types, one per line. Empty: images, PDFs, text and Office documents. HTML, SVG and
            scripts are never accepted.
          </FieldDescription>
        </Field>
      </Section>

      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

/** An upload limit in megabytes, as the settings form shows it (small API-set ones too). */
function shownMegabytes(bytes: number): string {
  return String(Number((bytes / 1024 / 1024).toPrecision(6)));
}

export type BuilderField = {
  /** The editor's own key for the row (never saved). */
  key: string;
  name: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder: string;
  options: string;
  /**
   * The saved choices, kept as they are until the choices box is edited: options set through the
   * API may carry spaces or line breaks the one-per-line editor can't round-trip.
   */
  savedOptions: string[] | null;
  /** Not editable here yet, but kept: saving the builder never drops a limit set by the API. */
  maxLength: number | null;
};

const TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Text",
  email: "Email",
  textarea: "Long text",
  number: "Number",
  tel: "Phone",
  url: "Link",
  date: "Date",
  select: "Dropdown",
  radio: "One of",
  checkbox: "Checkbox",
  hidden: "Hidden",
  file: "File",
};

function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "field";
  let name = base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}_${n}`;
  return name;
}

/** The fields editor and the hosted page's text, saved together. */
export function FormBuilder(
  props: EnvTarget & {
    formId: string;
    fields: BuilderField[];
    filesEnabled: boolean;
    hosted: {
      enabled: boolean;
      title: string | null;
      description: string | null;
      submitLabel: string | null;
      successMessage: string | null;
    };
  },
) {
  const [state, formAction, pending] = useActionToast(saveFormFieldsAction, {
    success: "Fields saved",
  });
  const { fields: initial, hosted, filesEnabled, ...target } = props;
  const [fields, setFields] = useState<BuilderField[]>(initial);
  const update = (index: number, change: Partial<BuilderField>) =>
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...change } : field)),
    );
  const move = (index: number, by: number) =>
    setFields((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + by, 0, moved);
      return next;
    });
  const serialized = JSON.stringify(
    fields.map((field, index) => ({
      name:
        field.name ||
        slugify(field.label, new Set(fields.filter((_, i) => i !== index).map((f) => f.name))),
      type: field.type,
      ...(field.label ? { label: field.label } : {}),
      required: field.required,
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.maxLength !== null ? { max_length: field.maxLength } : {}),
      ...(FORM_CHOICE_FIELD_TYPES.includes(field.type) || field.type === "checkbox"
        ? {
            options:
              field.savedOptions ??
              field.options
                .split("\n")
                .map((option) => option.trim())
                .filter(Boolean),
          }
        : {}),
    })),
  );
  const types = FORM_FIELD_TYPES.filter((type) => type !== "file" || filesEnabled);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Hidden {...target} />
      <input name="fields" type="hidden" value={serialized} />
      <div className="flex flex-col gap-3">
        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fields: the form accepts any field it's sent. Add fields to validate submissions and
            to publish a hosted page.
          </p>
        ) : null}
        {fields.map((field, index) => (
          <div className="flex flex-col gap-3 rounded-lg border p-4" key={field.key}>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_10rem]">
              <Field>
                <FieldLabel>Label</FieldLabel>
                <Input
                  onBlur={() => {
                    if (field.name) return;
                    const taken = new Set(fields.filter((_, i) => i !== index).map((f) => f.name));
                    update(index, { name: slugify(field.label, taken) });
                  }}
                  onChange={(event) => update(index, { label: event.currentTarget.value })}
                  value={field.label}
                />
              </Field>
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  className="font-mono"
                  onChange={(event) => update(index, { name: event.currentTarget.value.trim() })}
                  value={field.name}
                />
              </Field>
              <Field>
                <FieldLabel>Type</FieldLabel>
                <Select
                  items={types.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
                  onValueChange={(value) => update(index, { type: value as FormFieldType })}
                  value={field.type}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPopup>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
            </div>
            {FORM_CHOICE_FIELD_TYPES.includes(field.type) || field.type === "checkbox" ? (
              <Field>
                <FieldLabel>Choices</FieldLabel>
                <Textarea
                  onChange={(event) =>
                    update(index, { options: event.currentTarget.value, savedOptions: null })
                  }
                  placeholder={
                    field.type === "checkbox" ? "None: a single checkbox" : "One per line"
                  }
                  rows={3}
                  value={field.options}
                />
              </Field>
            ) : field.type !== "hidden" && field.type !== "file" ? (
              <Field>
                <FieldLabel>Placeholder</FieldLabel>
                <Input
                  onChange={(event) => update(index, { placeholder: event.currentTarget.value })}
                  value={field.placeholder}
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="gap-3">
                <Checkbox
                  checked={field.required}
                  onCheckedChange={(checked) => update(index, { required: checked === true })}
                />
                Required
              </Label>
              <div className="flex gap-1">
                <Button
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  aria-label="Move down"
                  disabled={index === fields.length - 1}
                  onClick={() => move(index, 1)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  aria-label="Remove field"
                  onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <div>
          <Button
            onClick={() =>
              setFields((current) => [
                ...current,
                {
                  key: crypto.randomUUID(),
                  name: current.some((field) => field.name === "email") ? "" : "email",
                  type: current.length === 0 ? "email" : "text",
                  label: current.length === 0 ? "Email" : "",
                  required: current.length === 0,
                  placeholder: "",
                  options: "",
                  savedOptions: null,
                  maxLength: null,
                },
              ])
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
            Add field
          </Button>
        </div>
      </div>

      <fieldset className="flex flex-col gap-4 border-t pt-6">
        <legend className="mb-1 font-semibold">Hosted page</legend>
        <Label className="items-start gap-3">
          <Checkbox className="mt-0.5" defaultChecked={hosted.enabled} name="hostedEnabled" />
          <span>
            Publish a page with these fields
            <span className="block text-muted-foreground text-sm">
              At the form's endpoint, for a link or an iframe. Pages can't ask for passwords or card
              numbers, and live pages are screened when they're published.
            </span>
          </span>
        </Label>
        <Field>
          <FieldLabel>Title</FieldLabel>
          <Input defaultValue={hosted.title ?? ""} maxLength={200} name="title" />
        </Field>
        <Field>
          <FieldLabel>Description</FieldLabel>
          <Textarea
            defaultValue={hosted.description ?? ""}
            maxLength={2000}
            name="description"
            rows={3}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Button</FieldLabel>
            <Input
              defaultValue={hosted.submitLabel ?? ""}
              maxLength={60}
              name="submitLabel"
              placeholder="Submit"
            />
          </Field>
          <Field>
            <FieldLabel>Thank-you message</FieldLabel>
            <Input
              defaultValue={hosted.successMessage ?? ""}
              maxLength={500}
              name="successMessage"
              placeholder="Your submission was received."
            />
          </Field>
        </div>
      </fieldset>

      {state && !state.ok ? <FormError message={state.error} /> : null}
      <div>
        <Button loading={pending} type="submit">
          Save fields
        </Button>
      </div>
    </form>
  );
}
