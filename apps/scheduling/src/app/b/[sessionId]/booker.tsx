"use client";

import { Alert, AlertDescription, AlertTitle } from "@coss/ui/components/alert";
import { Button } from "@coss/ui/components/button";
import { Checkbox } from "@coss/ui/components/checkbox";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Spinner } from "@coss/ui/components/spinner";
import { Textarea } from "@coss/ui/components/textarea";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SlotPicker } from "@/components/slot-picker";
import { useAccentColor } from "@/lib/branding";
import { browserTimeZone, ClientApiError, useClientApi } from "@/lib/client-api";
import { postToHost, reportHeight } from "@/lib/embed";

type Question = {
  key: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "phone" | "email" | "number";
  label: string;
  required: boolean;
  options: string[];
};

type Session = {
  brand_name: string | null;
  accent_color: string | null;
  sandbox: boolean;
  attendee_fixed: boolean;
  event_type: {
    title: string;
    duration_minutes: number;
    duration_options: number[];
    questions: Question[];
    requires_approval: boolean;
  };
};

type Slot = { start: string; end: string };

function QuestionField(props: {
  question: Question;
  onChange: (value: string | string[]) => void;
}) {
  const { question, onChange } = props;
  const id = `question-${question.key}`;
  if (question.type === "textarea") {
    return (
      <Textarea
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={question.required}
      />
    );
  }
  if (question.type === "select" || question.type === "radio") {
    return (
      <select
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        defaultValue=""
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={question.required}
      >
        <option disabled value="">
          Choose…
        </option>
        {question.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (question.type === "checkbox") {
    return (
      <div className="flex flex-col gap-2">
        {question.options.map((option) => (
          <Label className="flex items-center gap-2 font-normal" key={option}>
            <Checkbox onCheckedChange={(checked) => onChange(checked ? [option] : [])} />
            {option}
          </Label>
        ))}
      </div>
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
    />
  );
}

export function Booker({ sessionId, apiUrl }: { sessionId: string; apiUrl: string }) {
  const call = useClientApi(sessionId, apiUrl);
  const [session, setSession] = useState<Session | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [lostSlot, setLostSlot] = useState(false);
  const [done, setDone] = useState<{ status: string; start: string } | null>(null);
  const timeZone = useMemo(browserTimeZone, []);
  // One attempt's key, new for each chosen time: a double click or a retry can't book twice.
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID());

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

  const when = (iso: string) =>
    new Intl.DateTimeFormat(undefined, { timeZone, dateStyle: "full", timeStyle: "short" }).format(
      new Date(iso),
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!slot || !session) return;
    setSubmitting(true);
    setProblem(null);
    try {
      const booking = await call<{ id: string; status: string; start: string }>("/bookings", {
        method: "POST",
        idempotencyKey: attemptKey,
        body: {
          start: slot.start,
          ...(duration && duration !== session.event_type.duration_minutes
            ? { duration_minutes: duration }
            : {}),
          ...(session.attendee_fixed ? {} : { attendee: { name, email, time_zone: timeZone } }),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
        },
      });
      setDone({ status: booking.status, start: booking.start });
      postToHost({ type: "booked", booking_id: booking.id, status: booking.status });
    } catch (error) {
      if (error instanceof ClientApiError && error.detail.code === "slot_unavailable") {
        setSlot(null);
        setLostSlot(true);
      } else {
        setProblem((error as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (problem && !session) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <Alert variant="error">
          <AlertTitle>This link isn't working</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="flex min-h-64 items-center justify-center" aria-busy>
        <Spinner />
      </main>
    );
  }
  if (done) {
    return (
      <main className="mx-auto flex max-w-lg flex-col gap-2 p-6">
        <h1 className="font-semibold text-xl">
          {done.status === "pending_approval" ? "Request sent" : "You're booked"}
        </h1>
        <p className="text-sm">
          {session.event_type.title}, {when(done.start)}.
        </p>
        <p className="text-muted-foreground text-sm">
          {done.status === "pending_approval"
            ? "You'll get an email once it's approved."
            : "A confirmation is on its way, with a link to reschedule or cancel."}
        </p>
      </main>
    );
  }
  const durations = [session.event_type.duration_minutes, ...session.event_type.duration_options];
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        {session.brand_name ? (
          <p className="text-muted-foreground text-sm">{session.brand_name}</p>
        ) : null}
        <h1 className="font-semibold text-xl">{session.event_type.title}</h1>
        <p className="text-muted-foreground text-sm">{duration} minutes</p>
      </header>
      {session.sandbox ? (
        <Alert variant="warning">
          <AlertDescription>
            Test mode: nothing here is real, and nobody's emailed.
          </AlertDescription>
        </Alert>
      ) : null}
      {durations.length > 1 && !slot ? (
        <fieldset aria-label="Choose a length" className="flex gap-2">
          {durations.map((minutes) => (
            <Button
              aria-pressed={duration === minutes}
              key={minutes}
              onClick={() => setDuration(minutes)}
              size="sm"
              variant={duration === minutes ? "default" : "outline"}
            >
              {minutes} min
            </Button>
          ))}
        </fieldset>
      ) : null}
      {lostSlot && !slot ? (
        <Alert variant="warning">
          <AlertTitle>That time was just taken</AlertTitle>
          <AlertDescription>Please choose another.</AlertDescription>
        </Alert>
      ) : null}
      {slot ? (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>{when(slot.start)}</span>
            <Button onClick={() => setSlot(null)} size="sm" type="button" variant="ghost">
              Change
            </Button>
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
              <Label htmlFor={`question-${question.key}`}>
                {question.label}
                {question.required ? "" : " (optional)"}
              </Label>
              <QuestionField
                onChange={(value) => setAnswers((all) => ({ ...all, [question.key]: value }))}
                question={question}
              />
            </div>
          ))}
          {problem ? <p className="text-destructive-foreground text-sm">{problem}</p> : null}
          <Button disabled={submitting} type="submit">
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
    </main>
  );
}
