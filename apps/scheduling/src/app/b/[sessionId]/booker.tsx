"use client";

import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
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
import { Spinner } from "@coss/ui/components/spinner";
import { Textarea } from "@coss/ui/components/textarea";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  GlobeIcon,
  MapPinIcon,
  VideoIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  BrandMark,
  BrokenLink,
  Detail,
  DetailList,
  LoadingPanel,
  PageTitle,
  Panel,
  TestModeNotice,
} from "@/components/page";
import { type Slot, SlotPicker } from "@/components/slot-picker";
import { TimeZonePicker, zoneLabel } from "@/components/time-zone-picker";
import { type Branding, useAccentColor } from "@/lib/branding";
import { browserTimeZone, ClientApiError, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";

type Question = {
  key: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "phone" | "email" | "number";
  label: string;
  required: boolean;
  options: string[];
};

type Session = Branding & {
  sandbox: boolean;
  attendee_fixed: boolean;
  event_type: {
    title: string;
    duration_minutes: number;
    duration_options: number[];
    questions: Question[];
    locations: { type: string }[];
    requires_approval: boolean;
    max_guests: number;
  };
};

type Answer = string | string[];

const LOCATION_LABELS: Record<string, { label: string; icon: typeof VideoIcon }> = {
  link: { label: "Online", icon: VideoIcon },
  google_meet: { label: "Google Meet", icon: VideoIcon },
  microsoft_teams: { label: "Microsoft Teams", icon: VideoIcon },
  zoom: { label: "Zoom", icon: VideoIcon },
  phone: { label: "By phone", icon: MapPinIcon },
  in_person: { label: "In person", icon: MapPinIcon },
};

/** What the browser's own validation can't see, since these controls aren't plain inputs. */
export function unansweredQuestion(
  questions: Question[],
  answers: Record<string, Answer>,
): Question | null {
  return (
    questions.find((question) => {
      if (!question.required) return false;
      const answer = answers[question.key];
      return answer === undefined || answer.length === 0;
    }) ?? null
  );
}

function QuestionField(props: {
  question: Question;
  value: Answer | undefined;
  onChange: (value: Answer) => void;
}) {
  const { question, value, onChange } = props;
  const id = `question-${question.key}`;
  const single = typeof value === "string" ? value : null;
  if (question.type === "textarea") {
    return (
      <Textarea
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={question.required}
        value={single ?? ""}
      />
    );
  }
  if (question.type === "select") {
    return (
      <Select onValueChange={(next) => onChange(String(next))} value={single}>
        <SelectTrigger aria-labelledby={`${id}-label`} id={id}>
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectPopup>
          {question.options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    );
  }
  if (question.type === "radio") {
    return (
      <RadioGroup
        aria-labelledby={`${id}-label`}
        onValueChange={(next) => onChange(String(next))}
        value={single ?? ""}
      >
        {question.options.map((option) => (
          <Label className="flex items-center gap-2 font-normal" key={option}>
            <Radio value={option} />
            {option}
          </Label>
        ))}
      </RadioGroup>
    );
  }
  if (question.type === "checkbox") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <fieldset aria-labelledby={`${id}-label`} className="flex flex-col gap-2">
        {question.options.map((option) => (
          <Label className="flex items-center gap-2 font-normal" key={option}>
            <Checkbox
              checked={chosen.includes(option)}
              onCheckedChange={(checked) =>
                onChange(checked ? [...chosen, option] : chosen.filter((other) => other !== option))
              }
            />
            {option}
          </Label>
        ))}
      </fieldset>
    );
  }
  const inputType =
    question.type === "email"
      ? "email"
      : question.type === "phone"
        ? "tel"
        : question.type === "number"
          ? "number"
          : "text";
  return (
    <Input
      id={id}
      onChange={(event) => onChange(event.target.value)}
      required={question.required}
      type={inputType}
      value={single ?? ""}
    />
  );
}

type Done = { status: string; start: string; attendee_emailed: boolean };

function Confirmed(props: { session: Session; done: Done; when: string; timeZone: string }) {
  const { session, done, when, timeZone } = props;
  const pending = done.status === "pending_approval";
  const emailed = done.attendee_emailed && !session.sandbox;
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6 sm:py-12">
      {session.sandbox ? <TestModeNotice /> : null}
      <Panel className="flex flex-col gap-6 p-6 sm:p-8">
        <BrandMark branding={session} />
        <div className="flex flex-col gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckIcon aria-hidden="true" className="size-5" />
          </span>
          <PageTitle>{pending ? "Request sent" : "You're booked"}</PageTitle>
          {pending || emailed ? (
            <p className="text-pretty text-muted-foreground text-sm">
              {!pending
                ? "A confirmation is on its way, with a link to reschedule or cancel."
                : emailed
                  ? "You'll get an email once it's approved."
                  : "It's waiting to be approved."}
            </p>
          ) : null}
        </div>
        <DetailList>
          <Detail icon={CalendarIcon} label="What">
            {session.event_type.title}
          </Detail>
          <Detail icon={ClockIcon} label="When">
            {when}
          </Detail>
          <Detail icon={GlobeIcon} label="Time zone">
            {zoneLabel(timeZone)}
          </Detail>
        </DetailList>
      </Panel>
    </main>
  );
}

export function Booker({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [guests, setGuests] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lostSlot, setLostSlot] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  // One attempt's key, new for each chosen time: a double click or a retry can't book twice.
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID());
  const stepHeading = useRef<HTMLHeadingElement>(null);

  useAccentColor(session?.accent_color);
  useEffect(reportHeight, []);
  useEffect(() => {
    call<Session>("/session")
      .then((value) => {
        setSession(value);
        setDuration(value.event_type.duration_minutes);
        postToHost({ type: "ready" });
      })
      .catch((error: ClientApiError) => {
        setProblem(error.message);
        postToHost({
          type: "error",
          code: error.detail?.code ?? "unknown",
          message: error.message,
        });
      });
  }, [call]);

  const whenFormat = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "full", timeStyle: "short" }),
    [timeZone],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || !session) return;
    const unanswered = unansweredQuestion(session.event_type.questions, answers);
    if (unanswered) {
      setFormProblem(`Please answer "${unanswered.label}".`);
      return;
    }
    const guestEmails = guests.map((guest) => guest.trim()).filter(Boolean);
    setSubmitting(true);
    setFormProblem(null);
    try {
      const booking = await call<Done & { id: string }>("/bookings", {
        method: "POST",
        idempotencyKey: attemptKey,
        body: {
          start: slot.start,
          ...(duration && duration !== session.event_type.duration_minutes
            ? { duration_minutes: duration }
            : {}),
          ...(session.attendee_fixed ? {} : { attendee: { name, email, time_zone: timeZone } }),
          ...(guestEmails.length > 0
            ? { guests: guestEmails.map((guest) => ({ email: guest })) }
            : {}),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
        },
      });
      setDone(booking);
      postToHost({ type: "booked", booking_id: booking.id, status: booking.status });
    } catch (error) {
      if (error instanceof ClientApiError && error.detail.code === "slot_unavailable") {
        setSlot(null);
        setLostSlot(true);
      } else {
        setFormProblem((error as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (slot) stepHeading.current?.focus();
  }, [slot]);

  if (problem) return <BrokenLink message={problem} title="This link isn't working" />;
  if (!session) return <LoadingPanel className="max-w-5xl" />;
  if (done) {
    return (
      <Confirmed
        done={done}
        session={session}
        timeZone={timeZone}
        when={whenFormat.format(new Date(done.start))}
      />
    );
  }

  const durations = [session.event_type.duration_minutes, ...session.event_type.duration_options];
  const onlyLocation =
    session.event_type.locations.length === 1 ? session.event_type.locations[0] : undefined;
  const place = onlyLocation ? LOCATION_LABELS[onlyLocation.type] : undefined;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:py-12">
      {session.sandbox ? <TestModeNotice /> : null}
      <Panel className="grid md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5 border-b p-4 sm:p-6 md:border-e md:border-b-0">
          <BrandMark branding={session} />
          <PageTitle>{session.event_type.title}</PageTitle>
          <DetailList>
            {slot ? (
              <Detail icon={CalendarIcon} label="When">
                <span className="font-medium">{whenFormat.format(new Date(slot.start))}</span>
              </Detail>
            ) : null}
            <Detail icon={ClockIcon} label="Length">
              {durations.length > 1 && !slot ? (
                <fieldset aria-label="Choose a length" className="flex flex-wrap gap-1.5">
                  {durations.map((minutes) => (
                    <Button
                      aria-pressed={duration === minutes}
                      key={minutes}
                      onClick={() => setDuration(minutes)}
                      size="xs"
                      type="button"
                      variant={duration === minutes ? "default" : "outline"}
                    >
                      {minutes} min
                    </Button>
                  ))}
                </fieldset>
              ) : (
                `${duration} minutes`
              )}
            </Detail>
            {place ? (
              <Detail icon={place.icon} label="Where">
                {place.label}
              </Detail>
            ) : null}
            <Detail icon={GlobeIcon} label="Time zone">
              <TimeZonePicker onChange={setTimeZone} value={timeZone} />
            </Detail>
          </DetailList>
        </aside>
        <section className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
          {lostSlot && !slot ? (
            <Alert variant="warning">
              <AlertTitle>That time was just taken</AlertTitle>
              <AlertDescription>Please choose another.</AlertDescription>
            </Alert>
          ) : null}
          {slot ? (
            <form className="flex max-w-md flex-col gap-4" onSubmit={submit}>
              <div className="flex flex-col items-start gap-1">
                <Button
                  className="-ms-2"
                  onClick={() => {
                    setSlot(null);
                    setFormProblem(null);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeftIcon aria-hidden="true" />
                  Choose another time
                </Button>
                <h2 className="font-medium outline-none" ref={stepHeading} tabIndex={-1}>
                  Your details
                </h2>
              </div>
              {session.attendee_fixed ? null : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name">Your name</Label>
                    <Input
                      autoComplete="name"
                      id="name"
                      maxLength={100}
                      onChange={(event) => setName(event.target.value)}
                      required
                      value={name}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      autoComplete="email"
                      id="email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                </>
              )}
              {session.event_type.questions.map((question) => (
                <div className="flex flex-col gap-1.5" key={question.key}>
                  <Label htmlFor={`question-${question.key}`} id={`question-${question.key}-label`}>
                    {question.label}
                    {question.required ? null : (
                      <span className="font-normal text-muted-foreground"> (optional)</span>
                    )}
                  </Label>
                  <QuestionField
                    onChange={(value) => setAnswers((all) => ({ ...all, [question.key]: value }))}
                    question={question}
                    value={answers[question.key]}
                  />
                </div>
              ))}
              {session.event_type.max_guests > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {guests.map((guest, index) => (
                    // Guests only ever come and go from the end of the list.
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above.
                    <div className="flex flex-col gap-1.5" key={index}>
                      <Label htmlFor={`guest-${index}`}>Guest {index + 1} email</Label>
                      <Input
                        id={`guest-${index}`}
                        onChange={(event) =>
                          setGuests((all) =>
                            all.map((value, at) => (at === index ? event.target.value : value)),
                          )
                        }
                        type="email"
                        value={guest}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    {guests.length < session.event_type.max_guests ? (
                      <Button
                        onClick={() => setGuests((all) => [...all, ""])}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Add a guest
                      </Button>
                    ) : null}
                    {guests.length > 0 ? (
                      <Button
                        onClick={() => setGuests((all) => all.slice(0, -1))}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Remove the last guest
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {formProblem ? (
                <p className="text-destructive-foreground text-sm" role="alert">
                  {formProblem}
                </p>
              ) : null}
              <Button className="self-start max-sm:w-full" disabled={submitting} type="submit">
                {submitting ? <Spinner /> : null}
                {session.event_type.requires_approval ? "Request this time" : "Book this time"}
              </Button>
            </form>
          ) : (
            <SlotPicker
              call={call}
              durationMinutes={duration ?? undefined}
              onPick={(picked) => {
                setLostSlot(false);
                setAttemptKey(crypto.randomUUID());
                setSlot(picked);
              }}
              path="/slots"
              timeZone={timeZone}
            />
          )}
        </section>
      </Panel>
    </main>
  );
}
