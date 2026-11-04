"use client";

import { type EventTypeObjectOutput, MAX_GUESTS } from "@coss/scheduling/schemas";
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
import { Textarea } from "@coss/ui/components/textarea";
import { ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { FormError } from "@/components/form-error";
import { Panel, PanelBody } from "@/components/panel";
import {
  type EventTypeFormState,
  eventTypeFormState,
  eventTypePayload,
  formatJsonObject,
  formatOptionalJson,
  type HostRow,
  hasOptions,
  type LimitRow,
  type LocationRow,
  type LocationType,
  type QuestionRow,
  type QuestionType,
  questionKey,
} from "@/lib/scheduling-edit";
import { useActionToast } from "@/lib/toast";
import { updateEventTypeAction } from "./actions";
import type { EnvTarget } from "./scheduling-actions";

type Item = { value: string; label: string };

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "select", label: "Dropdown" },
  { value: "radio", label: "One of several" },
  { value: "checkbox", label: "Checkboxes" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email address" },
  { value: "number", label: "Number" },
];

const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "microsoft_teams", label: "Microsoft Teams" },
  { value: "zoom", label: "Zoom" },
  { value: "link", label: "A link" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
];

const LOCATION_VALUE: Partial<
  Record<LocationType, { label: string; placeholder: string; hint: string }>
> = {
  link: {
    label: "Link",
    placeholder: "https://meet.example.com/room",
    hint: "Leave it empty to use the host's own link.",
  },
  phone: {
    label: "Number",
    placeholder: "+15551234567",
    hint: "Leave it empty to use the host's own number, or ask the attendee for theirs.",
  },
  in_person: {
    label: "Address",
    placeholder: "1 Main St, Springfield",
    hint: "Leave it empty to use the host's own address.",
  },
};

const MAX_LIMITS = 4;
const MAX_QUESTIONS = 25;
const MAX_LOCATIONS = 10;

function Choice(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly Item[];
  disabled: boolean;
}) {
  return (
    <Select
      disabled={props.disabled}
      items={[...props.items]}
      onValueChange={(value) => props.onChange(value as string)}
      value={props.value}
    >
      <SelectTrigger aria-label={props.label}>
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

function Minutes(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  unit?: string;
  description?: string;
}) {
  return (
    <Field>
      <FieldLabel>
        {props.label}, in {props.unit ?? "minutes"}
      </FieldLabel>
      <Input
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(event.target.value)}
        required
        type="number"
        value={props.value}
      />
      {props.description ? <FieldDescription>{props.description}</FieldDescription> : null}
    </Field>
  );
}

function RowButtons(props: {
  label: string;
  canMoveUp?: boolean;
  onMoveUp?: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1">
      {props.onMoveUp ? (
        <Button
          aria-label={`Move ${props.label} up`}
          disabled={!props.canMoveUp}
          onClick={props.onMoveUp}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        aria-label={`Remove ${props.label}`}
        onClick={props.onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <XIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

function moveUp<T>(rows: readonly T[], index: number): T[] {
  const next = [...rows];
  const [row] = next.splice(index, 1);
  if (row !== undefined) next.splice(index - 1, 0, row);
  return next;
}

const replaced = <T extends { id: string }>(rows: readonly T[], id: string, change: Partial<T>) =>
  rows.map((row) => (row.id === id ? { ...row, ...change } : row));

export type HostOption = { id: string; name: string };
export type ScheduleOption = { id: string; hostId: string; name: string };

export function EventTypeForm(
  props: EnvTarget & {
    canEdit: boolean;
    /** HIPAA mode keeps attendees' details off hosts' calendars. */
    calendarDetailsLocked: boolean;
    eventType: EventTypeObjectOutput;
    hostOptions: HostOption[];
    /** There are more hosts than `hostOptions`, so others can be added by id or uid. */
    moreHosts: boolean;
    scheduleOptions: ScheduleOption[];
  },
) {
  const {
    canEdit,
    calendarDetailsLocked,
    eventType,
    hostOptions,
    moreHosts,
    scheduleOptions,
    orgSlug,
    projectSlug,
    envSlug,
  } = props;
  const [state, formAction, pending] = useActionToast(updateEventTypeAction, {
    success: "Event type saved",
  });
  const [form, setForm] = useState<EventTypeFormState>(() => eventTypeFormState(eventType));
  // Controlled, like the rest: React resets uncontrolled fields after an action, even a refused one.
  const [metadata, setMetadata] = useState(() => formatOptionalJson(eventType.metadata));
  const [hostFilter, setHostFilter] = useState(() => formatJsonObject(eventType.host_filter));
  const nextRow = useRef(0);
  const rowId = () => {
    nextRow.current += 1;
    return `new-${nextRow.current}`;
  };
  const set = (change: Partial<EventTypeFormState>) => setForm((old) => ({ ...old, ...change }));
  const payload = useMemo(
    () => JSON.stringify(eventTypePayload(form, eventType.kind)),
    [form, eventType.kind],
  );

  const kind = eventType.kind;
  const severalHosts = kind === "pool" || kind === "collective";
  const hostName = (id: string) => hostOptions.find((host) => host.id === id)?.name ?? id;

  const setDuration = (duration: string) =>
    // Start times that followed the duration keep following it.
    set({ duration, ...(form.step === form.duration ? { step: duration } : {}) });

  const addHost = () => {
    const taken = form.hosts.map((row) => row.host);
    const free = hostOptions.find((host) => !taken.includes(host.id));
    if (!free) return;
    const row: HostRow = {
      id: rowId(),
      host: free.id,
      role: kind === "collective" ? "required" : "member",
      weight: "100",
      schedule: null,
    };
    set({ hosts: [...form.hosts, row] });
  };
  const [hostRef, setHostRef] = useState("");
  const addHostByRef = () => {
    const host = hostRef.trim();
    if (!host || form.hosts.some((row) => row.host === host)) return;
    const row: HostRow = {
      id: rowId(),
      host,
      role: kind === "collective" ? "required" : "member",
      weight: "100",
      schedule: null,
    };
    set({ hosts: [...form.hosts, row] });
    setHostRef("");
  };
  const addQuestion = () => {
    const row: QuestionRow = {
      id: rowId(),
      saved: null,
      key: "",
      type: "text",
      label: "",
      required: false,
      options: "",
    };
    set({ questions: [...form.questions, row] });
  };
  const addLocation = () => {
    const row: LocationRow = { id: rowId(), saved: null, type: "link", value: "" };
    set({ locations: [...form.locations, row] });
  };
  const addLimit = () => {
    const row: LimitRow = { id: rowId(), period: "day", max: "8", scope: "event_type" };
    set({ limits: [...form.limits, row] });
  };

  const locationItems = LOCATION_TYPES.filter((item) => kind !== "group" || item.value !== "zoom");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <input name="projectSlug" type="hidden" value={projectSlug} />
      <input name="envSlug" type="hidden" value={envSlug} />
      <input name="eventTypeId" type="hidden" value={eventType.id} />
      <input name="payload" type="hidden" value={payload} />
      <fieldset className="contents" disabled={!canEdit}>
        <Panel title="Details">
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Title</FieldLabel>
              <Input
                maxLength={120}
                onChange={(event) => set({ title: event.target.value })}
                required
                value={form.title}
              />
              <FieldDescription>Shown to attendees and in emails.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Your id</FieldLabel>
              <Input
                maxLength={255}
                onChange={(event) => set({ uid: event.target.value })}
                value={form.uid}
              />
              <FieldDescription>Optional. The API accepts it in place of the id.</FieldDescription>
            </Field>
            <Minutes
              label="Duration"
              max={1440}
              min={5}
              onChange={setDuration}
              value={form.duration}
            />
            <Field>
              <FieldLabel>Other durations, in minutes</FieldLabel>
              <Input
                onChange={(event) => set({ durationOptions: event.target.value })}
                placeholder="15, 60"
                value={form.durationOptions}
              />
              <FieldDescription>
                Optional, up to 10. The booker's page lets the attendee choose.
              </FieldDescription>
            </Field>
            {kind === "group" ? (
              <Field>
                <FieldLabel>Capacity</FieldLabel>
                <Input
                  max={10000}
                  min={2}
                  onChange={(event) => set({ capacity: event.target.value })}
                  required
                  type="number"
                  value={form.capacity}
                />
                <FieldDescription>Attendees per session.</FieldDescription>
              </Field>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel
          description={
            severalHosts
              ? "Who takes these bookings. Removed hosts keep the bookings they have."
              : "Who takes these bookings. Moving it to someone else leaves their existing bookings with them."
          }
          title="Hosts"
        >
          <PanelBody className="flex flex-col gap-3">
            {form.hosts.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nobody yet, so nothing can be booked.</p>
            ) : null}
            {form.hosts.map((row) => {
              const taken = form.hosts.map((other) => other.host);
              const items = [
                ...hostOptions
                  .filter((host) => host.id === row.host || !taken.includes(host.id))
                  .map((host) => ({ value: host.id, label: host.name })),
                ...(hostOptions.some((host) => host.id === row.host)
                  ? []
                  : [{ value: row.host, label: hostName(row.host) }]),
              ];
              const schedules = [
                { value: "default", label: "Their default hours" },
                ...scheduleOptions
                  .filter((schedule) => schedule.hostId === row.host)
                  .map((schedule) => ({ value: schedule.id, label: schedule.name })),
              ];
              return (
                <div className="flex flex-wrap items-end gap-2" key={row.id}>
                  <div className="min-w-48 flex-1">
                    <Field>
                      <FieldLabel>Host</FieldLabel>
                      <Choice
                        disabled={!canEdit}
                        items={items}
                        label="Host"
                        onChange={(host) =>
                          set({
                            hosts: replaced(form.hosts, row.id, { host, schedule: null }),
                          })
                        }
                        value={row.host}
                      />
                    </Field>
                  </div>
                  {severalHosts ? (
                    <div className="w-36">
                      <Field>
                        <FieldLabel>Role</FieldLabel>
                        <Choice
                          disabled={!canEdit}
                          items={[
                            { value: "member", label: "Member" },
                            { value: "required", label: "Required" },
                          ]}
                          label="Role"
                          onChange={(role) =>
                            set({
                              hosts: replaced(form.hosts, row.id, {
                                role: role as HostRow["role"],
                              }),
                            })
                          }
                          value={row.role}
                        />
                      </Field>
                    </div>
                  ) : null}
                  {kind === "pool" ? (
                    <div className="w-24">
                      <Field>
                        <FieldLabel>Weight</FieldLabel>
                        <Input
                          max={10000}
                          min={1}
                          onChange={(event) =>
                            set({
                              hosts: replaced(form.hosts, row.id, { weight: event.target.value }),
                            })
                          }
                          required
                          type="number"
                          value={row.weight}
                        />
                      </Field>
                    </div>
                  ) : null}
                  <div className="min-w-44 flex-1">
                    <Field>
                      <FieldLabel>Hours</FieldLabel>
                      <Choice
                        disabled={!canEdit}
                        items={schedules}
                        label="Hours"
                        onChange={(value) =>
                          set({
                            hosts: replaced(form.hosts, row.id, {
                              schedule: value === "default" ? null : value,
                            }),
                          })
                        }
                        value={row.schedule ?? "default"}
                      />
                    </Field>
                  </div>
                  <RowButtons
                    label={hostName(row.host)}
                    onRemove={() =>
                      set({ hosts: form.hosts.filter((other) => other.id !== row.id) })
                    }
                  />
                </div>
              );
            })}
            {severalHosts || form.hosts.length === 0 ? (
              <div className="flex flex-col gap-3">
                <div>
                  <Button
                    disabled={
                      !hostOptions.some((host) => !form.hosts.some((r) => r.host === host.id))
                    }
                    onClick={addHost}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon aria-hidden="true" />
                    Add a host
                  </Button>
                </div>
                {moreHosts ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <Field>
                        <FieldLabel>Add a host who isn't listed</FieldLabel>
                        <Input
                          className="font-mono"
                          onChange={(event) => setHostRef(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            addHostByRef();
                          }}
                          placeholder="host_… or your id"
                          value={hostRef}
                        />
                        <FieldDescription>
                          This environment has too many hosts to list. Saving checks the id.
                        </FieldDescription>
                      </Field>
                    </div>
                    <div className="pb-6">
                      <Button onClick={addHostByRef} size="sm" type="button" variant="outline">
                        Add
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {kind === "pool" ? (
              <Field>
                <FieldLabel>Also include hosts with these attributes</FieldLabel>
                <Textarea
                  className="font-mono"
                  name="hostFilter"
                  onChange={(event) => setHostFilter(event.target.value)}
                  placeholder='{ "licensed_in": ["CA", "NY"] }'
                  value={hostFilter}
                />
                <FieldDescription>
                  A JSON object. Active hosts matching all of it join the pool.
                </FieldDescription>
              </Field>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel
          description="When it can be booked. Existing bookings keep their times."
          title="Timing"
        >
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <Minutes
              description="How far apart start times are."
              label="Time between start times"
              max={1440}
              min={5}
              onChange={(step) => set({ step })}
              value={form.step}
            />
            <Field>
              <FieldLabel>Time zone for start times</FieldLabel>
              <Input
                maxLength={64}
                onChange={(event) => set({ gridTimeZone: event.target.value })}
                placeholder="America/New_York"
                value={form.gridTimeZone}
              />
              <FieldDescription>Optional. Each host's own by default.</FieldDescription>
            </Field>
            <Minutes
              label="Buffer before"
              max={480}
              min={0}
              onChange={(bufferBefore) => set({ bufferBefore })}
              value={form.bufferBefore}
            />
            <Minutes
              label="Buffer after"
              max={480}
              min={0}
              onChange={(bufferAfter) => set({ bufferAfter })}
              value={form.bufferAfter}
            />
            <Minutes
              description="How close to the start it can still be booked."
              label="Minimum notice"
              max={525600}
              min={0}
              onChange={(minNotice) => set({ minNotice })}
              value={form.minNotice}
            />
            <Field>
              <FieldLabel>Booking window</FieldLabel>
              <Choice
                disabled={!canEdit}
                items={[
                  { value: "none", label: "No limit" },
                  { value: "rolling", label: "A number of days ahead" },
                  { value: "range", label: "Between two dates" },
                ]}
                label="Booking window"
                onChange={(value) => set({ windowMode: value as EventTypeFormState["windowMode"] })}
                value={form.windowMode}
              />
            </Field>
            {form.windowMode === "rolling" ? (
              <Field>
                <FieldLabel>Days ahead</FieldLabel>
                <Input
                  max={730}
                  min={1}
                  onChange={(event) => set({ windowDays: event.target.value })}
                  required
                  type="number"
                  value={form.windowDays}
                />
              </Field>
            ) : null}
            {form.windowMode === "range" ? (
              <>
                <Field>
                  <FieldLabel>From</FieldLabel>
                  <Input
                    onChange={(event) => set({ windowFrom: event.target.value })}
                    required
                    type="date"
                    value={form.windowFrom}
                  />
                </Field>
                <Field>
                  <FieldLabel>To</FieldLabel>
                  <Input
                    onChange={(event) => set({ windowTo: event.target.value })}
                    required
                    type="date"
                    value={form.windowTo}
                  />
                </Field>
              </>
            ) : null}
          </PanelBody>
        </Panel>

        <Panel
          description="At most this many bookings. Counted in the host's time zone."
          title="Limits"
        >
          <PanelBody className="flex flex-col gap-3">
            {form.limits.length === 0 ? (
              <p className="text-muted-foreground text-sm">No limits.</p>
            ) : null}
            {form.limits.map((row) => (
              <div className="flex flex-wrap items-end gap-2" key={row.id}>
                <div className="w-24">
                  <Field>
                    <FieldLabel>At most</FieldLabel>
                    <Input
                      max={1000}
                      min={1}
                      onChange={(event) =>
                        set({ limits: replaced(form.limits, row.id, { max: event.target.value }) })
                      }
                      required
                      type="number"
                      value={row.max}
                    />
                  </Field>
                </div>
                <div className="w-36">
                  <Field>
                    <FieldLabel>Each</FieldLabel>
                    <Choice
                      disabled={!canEdit}
                      items={[
                        { value: "day", label: "Day" },
                        { value: "week", label: "Week" },
                      ]}
                      label="Each"
                      onChange={(period) =>
                        set({
                          limits: replaced(form.limits, row.id, {
                            period: period as LimitRow["period"],
                          }),
                        })
                      }
                      value={row.period}
                    />
                  </Field>
                </div>
                <div className="min-w-56 flex-1">
                  <Field>
                    <FieldLabel>Counting</FieldLabel>
                    <Choice
                      disabled={!canEdit}
                      items={[
                        { value: "event_type", label: "This event type's bookings" },
                        { value: "host", label: "All of the host's bookings" },
                      ]}
                      label="Counting"
                      onChange={(scope) =>
                        set({
                          limits: replaced(form.limits, row.id, {
                            scope: scope as LimitRow["scope"],
                          }),
                        })
                      }
                      value={row.scope}
                    />
                  </Field>
                </div>
                <RowButtons
                  label="this limit"
                  onRemove={() =>
                    set({ limits: form.limits.filter((other) => other.id !== row.id) })
                  }
                />
              </div>
            ))}
            <div>
              <Button
                disabled={form.limits.length >= MAX_LIMITS}
                onClick={addLimit}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon aria-hidden="true" />
                Add a limit
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel
          description="What the booker's page asks. Answers are stored encrypted, and only the API returns them."
          title="Questions"
        >
          <PanelBody className="flex flex-col gap-4">
            {form.questions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No questions.</p>
            ) : null}
            {form.questions.map((row, index) => (
              <div className="flex flex-col gap-3 rounded-lg border p-3" key={row.id}>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-56 flex-[2]">
                    <Field>
                      <FieldLabel>Question</FieldLabel>
                      <Input
                        maxLength={200}
                        onBlur={() => {
                          if (row.saved || row.key || !row.label.trim()) return;
                          const taken = form.questions.map((other) => other.key);
                          set({
                            questions: replaced(form.questions, row.id, {
                              key: questionKey(row.label, taken),
                            }),
                          });
                        }}
                        onChange={(event) =>
                          set({
                            questions: replaced(form.questions, row.id, {
                              label: event.target.value,
                            }),
                          })
                        }
                        required
                        value={row.label}
                      />
                    </Field>
                  </div>
                  <div className="min-w-40 flex-1">
                    <Field>
                      <FieldLabel>Answer</FieldLabel>
                      <Choice
                        disabled={!canEdit}
                        items={QUESTION_TYPES}
                        label="Answer"
                        onChange={(type) =>
                          set({
                            questions: replaced(form.questions, row.id, {
                              type: type as QuestionType,
                            }),
                          })
                        }
                        value={row.type}
                      />
                    </Field>
                  </div>
                  <RowButtons
                    canMoveUp={index > 0}
                    label={row.label || "this question"}
                    onMoveUp={() => set({ questions: moveUp(form.questions, index) })}
                    onRemove={() =>
                      set({ questions: form.questions.filter((other) => other.id !== row.id) })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                  <div className="min-w-56 flex-1">
                    <Field>
                      <FieldLabel>Key</FieldLabel>
                      <Input
                        className="font-mono"
                        disabled={row.saved !== null || !canEdit}
                        maxLength={64}
                        onChange={(event) =>
                          set({
                            questions: replaced(form.questions, row.id, {
                              key: event.target.value,
                            }),
                          })
                        }
                        pattern="[a-z][a-z0-9_]*"
                        required
                        title="Lower case letters, digits and underscores, starting with a letter."
                        value={row.key}
                      />
                      <FieldDescription>
                        {row.saved
                          ? "Answers are stored under it, so it can't change."
                          : "What answers are stored under. It can't change once saved."}
                      </FieldDescription>
                    </Field>
                  </div>
                  <Label className="flex items-center gap-2 pb-6 font-normal">
                    <Checkbox
                      checked={row.required}
                      disabled={!canEdit}
                      onCheckedChange={(checked) =>
                        set({
                          questions: replaced(form.questions, row.id, {
                            required: checked === true,
                          }),
                        })
                      }
                    />
                    Required
                  </Label>
                </div>
                {hasOptions(row.type) ? (
                  <Field>
                    <FieldLabel>Options</FieldLabel>
                    <Textarea
                      onChange={(event) =>
                        set({
                          questions: replaced(form.questions, row.id, {
                            options: event.target.value,
                          }),
                        })
                      }
                      required={row.type !== "checkbox"}
                      value={row.options}
                    />
                    <FieldDescription>One per line.</FieldDescription>
                  </Field>
                ) : null}
              </div>
            ))}
            <div>
              <Button
                disabled={form.questions.length >= MAX_QUESTIONS}
                onClick={addQuestion}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon aria-hidden="true" />
                Add a question
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel title="Guests and calendars">
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            {kind === "group" ? null : (
              <Field>
                <FieldLabel>Guests an attendee can add</FieldLabel>
                <Input
                  max={MAX_GUESTS}
                  min={0}
                  onChange={(event) => set({ maxGuests: event.target.value })}
                  required
                  type="number"
                  value={form.maxGuests}
                />
                <FieldDescription>
                  Up to {MAX_GUESTS}. They're emailed about the booking, with no link to change it.
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel>Upcoming bookings per person</FieldLabel>
              <Input
                max={1000}
                min={1}
                onChange={(event) => set({ maxActivePerAttendee: event.target.value })}
                placeholder="No limit"
                type="number"
                value={form.maxActivePerAttendee}
              />
              <FieldDescription>
                How many of these one person can have booked at a time, known by their email or your
                id for them. Guests don't count.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>What hosts' calendars show</FieldLabel>
              <Choice
                disabled={!canEdit || calendarDetailsLocked}
                items={[
                  { value: "neutral", label: 'A private event titled "Appointment"' },
                  { value: "full", label: "A private event with the booking's details" },
                ]}
                label="What hosts' calendars show"
                onChange={(value) =>
                  set({ calendarDetails: value as EventTypeFormState["calendarDetails"] })
                }
                value={form.calendarDetails}
              />
              <FieldDescription>
                {calendarDetailsLocked
                  ? "HIPAA mode keeps attendees' details off hosts' calendars."
                  : form.calendarDetails === "full"
                    ? "Names, emails and phone numbers go to the host's calendar provider, never answers. Upcoming events change too."
                    : "Nothing about the attendee reaches the host's calendar provider. Upcoming events change too."}
              </FieldDescription>
            </Field>
          </PanelBody>
        </Panel>

        <Panel
          description="Where it happens. The first is the default, and the booker's page offers the rest."
          title="Locations"
        >
          <PanelBody className="flex flex-col gap-3">
            {form.locations.length === 0 ? (
              <p className="text-muted-foreground text-sm">No location set.</p>
            ) : null}
            {form.locations.map((row, index) => {
              const value = LOCATION_VALUE[row.type];
              return (
                <div className="flex flex-wrap items-start gap-2" key={row.id}>
                  <div className="w-48">
                    <Field>
                      <FieldLabel>Type</FieldLabel>
                      <Choice
                        disabled={!canEdit}
                        items={locationItems}
                        label="Type"
                        onChange={(type) =>
                          set({
                            locations: replaced(form.locations, row.id, {
                              type: type as LocationType,
                              value: "",
                            }),
                          })
                        }
                        value={row.type}
                      />
                    </Field>
                  </div>
                  <div className="min-w-56 flex-1">
                    {value ? (
                      <Field>
                        <FieldLabel>{value.label}</FieldLabel>
                        <Input
                          onChange={(event) =>
                            set({
                              locations: replaced(form.locations, row.id, {
                                value: event.target.value,
                              }),
                            })
                          }
                          placeholder={value.placeholder}
                          type={row.type === "link" ? "url" : "text"}
                          value={row.value}
                        />
                        {value.hint ? <FieldDescription>{value.hint}</FieldDescription> : null}
                      </Field>
                    ) : (
                      <p className="pt-7 text-muted-foreground text-sm">
                        A meeting is created on the host's account for each booking.
                      </p>
                    )}
                  </div>
                  <div className="pt-6">
                    <RowButtons
                      canMoveUp={index > 0}
                      label="this location"
                      onMoveUp={() => set({ locations: moveUp(form.locations, index) })}
                      onRemove={() =>
                        set({ locations: form.locations.filter((other) => other.id !== row.id) })
                      }
                    />
                  </div>
                </div>
              );
            })}
            <div>
              <Button
                disabled={form.locations.length >= MAX_LOCATIONS}
                onClick={addLocation}
                size="sm"
                type="button"
                variant="outline"
              >
                <PlusIcon aria-hidden="true" />
                Add a location
              </Button>
            </div>
          </PanelBody>
        </Panel>

        <Panel title="Approval and changes">
          <PanelBody className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={form.requiresApproval}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => set({ requiresApproval: checked === true })}
                />
                A host approves each booking
              </Label>
              <p className="text-muted-foreground text-xs">
                The time is held until a host approves or declines, or the time to approve runs out.
              </p>
            </div>
            {form.requiresApproval ? (
              <Minutes
                label="Time to approve"
                max={43200}
                min={5}
                onChange={(approvalTtl) => set({ approvalTtl })}
                value={form.approvalTtl}
              />
            ) : null}
            <Minutes
              description="How long a slot stays held for a booking in progress."
              label="Hold length"
              max={86400}
              min={60}
              onChange={(holdTtl) => set({ holdTtl })}
              unit="seconds"
              value={form.holdTtl}
            />
            <Minutes
              description="Attendees can't cancel closer to the start than this. You and your hosts can."
              label="Cancellation notice"
              max={525600}
              min={0}
              onChange={(cancelNotice) => set({ cancelNotice })}
              value={form.cancelNotice}
            />
            <Minutes
              description="Attendees can't reschedule closer to the start than this. You and your hosts can."
              label="Reschedule notice"
              max={525600}
              min={0}
              onChange={(rescheduleNotice) => set({ rescheduleNotice })}
              value={form.rescheduleNotice}
            />
          </PanelBody>
        </Panel>

        <Panel
          description="Your own key-value pairs, as a JSON object. Don't put sensitive data here."
          title="Metadata"
        >
          <PanelBody>
            <Field>
              <FieldLabel className="sr-only">Metadata</FieldLabel>
              <Textarea
                className="font-mono"
                name="metadata"
                onChange={(event) => setMetadata(event.target.value)}
                placeholder='{ "clinic": "north" }'
                value={metadata}
              />
            </Field>
          </PanelBody>
        </Panel>

        {canEdit ? (
          <div className="flex flex-col items-start gap-3">
            {state && !state.ok ? <FormError message={state.error} /> : null}
            <Button disabled={pending} type="submit">
              Save event type
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
