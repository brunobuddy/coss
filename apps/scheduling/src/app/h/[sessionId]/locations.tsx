"use client";

import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Skeleton } from "@coss/ui/components/skeleton";
import { Spinner } from "@coss/ui/components/spinner";
import { CheckIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { ClientCall } from "@/lib/client-api";
import type { HostSession } from "./types";

type HostLocation =
  | { type: "link"; url: string }
  | { type: "phone"; number: string }
  | { type: "in_person"; address: string };

type Values = { address: string; url: string; number: string };

function valuesOf(locations: readonly HostLocation[]): Values {
  const values: Values = { address: "", url: "", number: "" };
  for (const location of locations) {
    if (location.type === "in_person") values.address = location.address;
    if (location.type === "link") values.url = location.url;
    if (location.type === "phone") values.number = location.number;
  }
  return values;
}

function locationsOf({ address, url, number }: Values): HostLocation[] {
  return [
    ...(address.trim() ? [{ type: "in_person" as const, address: address.trim() }] : []),
    ...(url.trim() ? [{ type: "link" as const, url: url.trim() }] : []),
    ...(number.trim() ? [{ type: "phone" as const, number: number.trim() }] : []),
  ];
}

export function Locations(props: { call: ClientCall; session: HostSession }) {
  const { call, session } = props;
  const [values, setValues] = useState<Values | null>(null);
  const [savedAs, setSavedAs] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    call<{ data: HostLocation[] }>("/host/locations")
      .then((response) => {
        const initial = valuesOf(response.data);
        setValues(initial);
        setSavedAs(JSON.stringify(locationsOf(initial)));
      })
      .catch((error: Error) => setProblem(error.message));
  }, [call]);

  const change = (key: keyof Values, value: string) => {
    setJustSaved(false);
    setProblem(null);
    setValues((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!values) return;
    setSaving(true);
    setProblem(null);
    setJustSaved(false);
    try {
      const response = await call<{ data: HostLocation[] }>("/host/locations", {
        method: "PUT",
        body: { locations: locationsOf(values) },
      });
      const next = valuesOf(response.data);
      setValues(next);
      setSavedAs(JSON.stringify(locationsOf(next)));
      setJustSaved(true);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!values) {
    return problem ? (
      <p className="text-destructive-foreground text-sm" role="alert">
        {problem}
      </p>
    ) : (
      <div aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">Loading your locations</span>
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }
  return (
    <form className="flex flex-col gap-4 sm:max-w-md" onSubmit={save}>
      <p className="text-muted-foreground text-sm">
        Where your bookings happen when the booking doesn't name a place itself. Attendees see these
        once they've booked, and changes only reach new bookings.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-location-address">Office address</Label>
        <Input
          disabled={session.read_only}
          id="host-location-address"
          maxLength={500}
          onChange={(event) => change("address", event.target.value)}
          value={values.address}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-location-url">Meeting link</Label>
        <Input
          disabled={session.read_only}
          id="host-location-url"
          inputMode="url"
          maxLength={2000}
          onChange={(event) => change("url", event.target.value)}
          placeholder="https://"
          value={values.url}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="host-location-number">Phone number</Label>
        <Input
          disabled={session.read_only}
          id="host-location-number"
          inputMode="tel"
          maxLength={16}
          onChange={(event) => change("number", event.target.value)}
          placeholder="+12125550100"
          value={values.number}
        />
      </div>
      {problem ? (
        <p className="text-destructive-foreground text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {session.read_only ? null : (
        <div className="flex items-center gap-3">
          <Button
            disabled={saving || savedAs === JSON.stringify(locationsOf(values))}
            type="submit"
          >
            {saving ? <Spinner /> : null}
            Save locations
          </Button>
          {justSaved ? (
            <span className="flex items-center gap-1.5 text-muted-foreground text-sm" role="status">
              <CheckIcon aria-hidden="true" className="size-4" />
              Saved
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}
