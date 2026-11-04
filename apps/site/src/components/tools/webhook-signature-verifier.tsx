"use client";

import { Button } from "@coss/ui/components/button";
import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Switch } from "@coss/ui/components/switch";
import { Textarea } from "@coss/ui/components/textarea";
import { useId, useState } from "react";
import { checkWebhookSignature, type SignatureResult } from "@/lib/webhook-signature";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        autoComplete="off"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        value={value}
      />
    </div>
  );
}

export function WebhookSignatureVerifier() {
  const [body, setBody] = useState("");
  const [id, setId] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [signatures, setSignatures] = useState("");
  const [secret, setSecret] = useState("");
  const [ignoreAge, setIgnoreAge] = useState(true);
  const [result, setResult] = useState<SignatureResult | null>(null);
  const bodyId = useId();
  const ageId = useId();

  return (
    <form
      className="flex flex-col gap-6 border-t px-4 py-8 sm:px-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setResult(
          await checkWebhookSignature({ body, id, timestamp, signatures, secret, ignoreAge }),
        );
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={bodyId}>Raw request body</Label>
        <Textarea
          className="font-mono"
          id={bodyId}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          spellCheck={false}
          value={body}
        />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Field label="webhook-id" onChange={setId} placeholder="msg_…" value={id} />
        <Field
          label="webhook-timestamp"
          onChange={setTimestamp}
          placeholder="Seconds since the epoch"
          value={timestamp}
        />
        <Field
          label="webhook-signature"
          onChange={setSignatures}
          placeholder="v1,…"
          value={signatures}
        />
        <Field label="Signing secret" onChange={setSecret} placeholder="whsec_…" value={secret} />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={ignoreAge} id={ageId} onCheckedChange={setIgnoreAge} />
        <Label htmlFor={ageId}>Ignore the timestamp's age (for a request you saved earlier)</Label>
      </div>
      <div>
        <Button type="submit">Check signature</Button>
      </div>
      {result ? (
        <p aria-live="polite" className="border-t pt-6">
          {result.ok ? (
            <>
              <strong className="font-semibold">Valid.</strong> This signature matches:{" "}
              <code className="break-all font-mono text-sm">{result.matched}</code>
            </>
          ) : (
            <>
              <strong className="font-semibold">Not valid.</strong> {result.message}
            </>
          )}
        </p>
      ) : null}
    </form>
  );
}
