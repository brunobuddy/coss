"use client";

import { Input } from "@coss/ui/components/input";
import { Label } from "@coss/ui/components/label";
import { Switch } from "@coss/ui/components/switch";
import { Textarea } from "@coss/ui/components/textarea";
import { useId, useState } from "react";
import { buildDmarcRecord, DMARC_POLICIES, type DmarcPolicy, readDmarcRecord } from "@/lib/dmarc";

function PolicyPicker({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: DmarcPolicy;
  onChange: (policy: DmarcPolicy) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-medium text-sm">{legend}</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        {DMARC_POLICIES.map((policy) => (
          <label className="flex items-center gap-2" key={policy}>
            <input
              checked={value === policy}
              name={name}
              onChange={() => onChange(policy)}
              type="radio"
            />
            {policy}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DmarcRecordChecker() {
  const [policy, setPolicy] = useState<DmarcPolicy>("none");
  const [subdomainPolicy, setSubdomainPolicy] = useState<DmarcPolicy>("none");
  const [rua, setRua] = useState("");
  const [strictAlignment, setStrictAlignment] = useState(false);
  const [pasted, setPasted] = useState("");
  const ruaId = useId();
  const strictId = useId();
  const pastedId = useId();
  const record = buildDmarcRecord({ policy, subdomainPolicy, rua, strictAlignment });
  const reading = pasted.trim() ? readDmarcRecord(pasted) : null;
  return (
    <div className="grid border-t lg:grid-cols-2">
      <section
        aria-labelledby="dmarc-build"
        className="flex flex-col gap-6 border-b px-4 py-8 sm:px-8 lg:border-r lg:border-b-0"
      >
        <h2 className="font-semibold text-2xl tracking-[-0.02em]" id="dmarc-build">
          Generate a record
        </h2>
        <PolicyPicker legend="Policy" onChange={setPolicy} value={policy} />
        <PolicyPicker
          legend="Policy for subdomains"
          onChange={setSubdomainPolicy}
          value={subdomainPolicy}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor={ruaId}>Address for aggregate reports</Label>
          <Input
            id={ruaId}
            onChange={(event) => setRua(event.target.value)}
            placeholder="dmarc@yourdomain.com"
            type="email"
            value={rua}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={strictAlignment} id={strictId} onCheckedChange={setStrictAlignment} />
          <Label htmlFor={strictId}>Strict alignment (no subdomains)</Label>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Publish this as a TXT record at <code className="font-mono">_dmarc.yourdomain.com</code>
          </p>
          <code className="break-all rounded-lg border bg-background p-4 font-mono text-sm">
            {record}
          </code>
        </div>
      </section>
      <section aria-labelledby="dmarc-read" className="flex flex-col gap-6 px-4 py-8 sm:px-8">
        <h2 className="font-semibold text-2xl tracking-[-0.02em]" id="dmarc-read">
          Check a record
        </h2>
        <div className="flex flex-col gap-2">
          <Label htmlFor={pastedId}>Paste a DMARC record</Label>
          <Textarea
            className="font-mono"
            id={pastedId}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com;"
            rows={4}
            spellCheck={false}
            value={pasted}
          />
        </div>
        {reading ? (
          <div aria-live="polite" className="flex flex-col gap-4 text-sm">
            <p className="font-medium">
              {reading.errors.length === 0
                ? "This record is valid."
                : "Receivers may ignore this record."}
            </p>
            {[...reading.errors, ...reading.advice].length > 0 ? (
              <ul className="flex list-disc flex-col gap-1.5 pl-5">
                {[...reading.errors, ...reading.advice].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <dl className="flex flex-col divide-y border-y">
              {reading.tags.map((tag) => (
                <div
                  className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4"
                  key={`${tag.name}=${tag.value}`}
                >
                  <dt className="break-all font-mono">
                    {tag.name}={tag.value}
                  </dt>
                  <dd className="text-muted-foreground">
                    {tag.meaning}
                    {tag.problem ? ` ${tag.problem}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </section>
    </div>
  );
}
