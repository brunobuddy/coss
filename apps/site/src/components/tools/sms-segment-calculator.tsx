"use client";

import { countSegments, isGsm7, MAX_SMS_BODY_LENGTH, MAX_SMS_SEGMENTS } from "@coss/sms/segments";
import { Label } from "@coss/ui/components/label";
import { Switch } from "@coss/ui/components/switch";
import { Textarea } from "@coss/ui/components/textarea";
import { useId, useState } from "react";

const SAMPLE =
  "Your Acme order has shipped and arrives Thursday. Track it: https://acme.test/t/4815";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 border-b px-4 py-5 sm:border-r sm:border-b-0 sm:px-8 sm:last:border-r-0">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-mono text-2xl">{value}</dd>
    </div>
  );
}

export function SmsSegmentCalculator() {
  const [body, setBody] = useState(SAMPLE);
  const [tollFree, setTollFree] = useState(false);
  const bodyId = useId();
  const tollFreeId = useId();
  const { encoding, segments, units, remaining } = countSegments(body, { tollFree });
  const forcing = [...new Set([...body].filter((character) => !isGsm7(character)))];
  return (
    <div>
      <div className="flex flex-col gap-4 border-t px-4 py-8 sm:px-8">
        <Label htmlFor={bodyId}>Message</Label>
        <Textarea
          id={bodyId}
          onChange={(event) => setBody(event.target.value)}
          rows={5}
          value={body}
        />
        <div className="flex items-center gap-2">
          <Switch checked={tollFree} id={tollFreeId} onCheckedChange={setTollFree} />
          <Label htmlFor={tollFreeId}>Sent from a toll-free number</Label>
        </div>
      </div>
      <dl aria-live="polite" className="grid border-t sm:grid-cols-4">
        <Stat label="Segments" value={segments} />
        <Stat label="Encoding" value={encoding === "gsm7" ? "GSM-7" : "UCS-2"} />
        <Stat label={encoding === "gsm7" ? "Septets" : "Code units"} value={units} />
        <Stat label="Left in this segment" value={remaining} />
      </dl>
      {forcing.length > 0 || segments > MAX_SMS_SEGMENTS || body.length > MAX_SMS_BODY_LENGTH ? (
        <div className="flex flex-col gap-2 border-t px-4 py-6 text-sm sm:px-8">
          {forcing.length > 0 ? (
            <p>
              These characters aren't in GSM-7 and force the whole message into UCS-2:{" "}
              <span className="font-mono">{forcing.join(" ")}</span>
            </p>
          ) : null}
          {segments > MAX_SMS_SEGMENTS || body.length > MAX_SMS_BODY_LENGTH ? (
            <p>
              coss.com accepts up to {MAX_SMS_SEGMENTS} segments and{" "}
              {MAX_SMS_BODY_LENGTH.toLocaleString("en-US")} characters, so this one is too long.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
