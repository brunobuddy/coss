import snippets from "@coss/sdkgen/snippets.json";
import { Badge } from "@coss/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { highlight } from "fumadocs-core/highlight";
import { Replay } from "@/components/marketing/demo";
import { Tray } from "@/components/marketing/kit";
import { CODE_THEMES } from "@/lib/site";
import type { ProductShowcase } from "./types";

const LANGUAGES = [
  ["python", "Python", "python"],
  ["go", "Go", "go"],
  ["ruby", "Ruby", "ruby"],
  ["php", "PHP", "php"],
  ["java", "Java", "java"],
  ["csharp", ".NET", "csharp"],
] as const;

/** The same call in every generated SDK: their real samples, from the API reference. */
async function Languages() {
  const send = snippets["POST /v1/emails"];
  const samples = await Promise.all(
    LANGUAGES.map(async ([key, label, lang]) => ({
      key,
      label,
      code: await highlight(send[key], { lang, themes: CODE_THEMES }),
    })),
  );
  return (
    <Tray flush>
      <Tabs defaultValue="python">
        <div className="overflow-x-auto p-2">
          <TabsList className="w-max">
            {samples.map((sample) => (
              <TabsTab key={sample.key} value={sample.key}>
                {sample.label}
              </TabsTab>
            ))}
          </TabsList>
        </div>
        {samples.map((sample) => (
          <TabsPanel
            className="sdk-sample max-h-80 overflow-auto border-t p-4 font-mono text-[0.8125rem] leading-relaxed [&_pre]:bg-transparent!"
            key={sample.key}
            value={sample.key}
          >
            {sample.code}
          </TabsPanel>
        ))}
      </Tabs>
    </Tray>
  );
}

const DROP_INS = [
  ["Nodemailer", "coss/nodemailer"],
  ["Better Auth", "coss/better-auth"],
  ["Auth.js", "coss/authjs"],
  ["Laravel", "coss/laravel"],
  ["Rails", "coss-rails"],
  ["Django", "coss-django"],
] as const;

function DropIns() {
  return (
    <Tray flush title="Keep your mail library">
      <Table>
        <TableBody>
          {DROP_INS.map(([framework, name]) => (
            <TableRow key={framework}>
              <TableCell className="ps-4">{framework}</TableCell>
              <TableCell className="pe-4 text-right font-mono text-xs">{name}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

function Terminal() {
  return (
    <Tray title="coss">
      <pre className="overflow-x-auto font-mono text-[0.8125rem] leading-relaxed">
        {`$ coss login
$ coss init
$ coss emails send --simulate bounced
$ coss logs tail --source email --level error
$ coss listen --forward-to localhost:3000/webhooks`}
      </pre>
    </Tray>
  );
}

const INSTALLS = [
  ["TypeScript", "npm install coss"],
  ["Python", "pip install cosscom"],
  ["Go", "go get github.com/cosscom/coss-go"],
  ["Ruby", "gem install coss"],
  ["PHP", "composer require coss/coss"],
  [".NET", "dotnet add package Coss"],
  ["CLI", "brew install cosscom/tap/coss"],
] as const;

function Installs() {
  return (
    <Tray flush title="Install">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4">Language or tool</TableHead>
            <TableHead className="pe-4 text-right">Command</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {INSTALLS.map(([language, command]) => (
            <TableRow key={language}>
              <TableCell className="ps-4">{language}</TableCell>
              <TableCell className="pe-4 text-right font-mono text-xs">{command}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Tray>
  );
}

export const sdks: ProductShowcase = {
  close: "Install it and send something today.",
  lede: "One client for every product, generated for six more languages, with retries that never send twice.",
  call: "coss.email.send()",
  stage: (
    <Replay
      events={[
        { name: "POST /v1/emails 503", tone: "warning", at: "attempt 1" },
        { name: "POST /v1/emails 429", tone: "warning", at: "attempt 2" },
        { name: "POST /v1/emails 202", tone: "success", at: "attempt 3" },
      ]}
    >
      <div className="flex items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <p className="truncate font-medium">Retried for you</p>
          <p className="truncate font-mono text-muted-foreground text-xs">
            Idempotency-Key: reused on every attempt
          </p>
        </div>
        <Badge variant="success">sent once</Badge>
      </div>
    </Replay>
  ),
  highlights: [
    {
      title: "Six more languages",
      body: "Python, Go, Ruby, PHP, Java and .NET, generated from the OpenAPI document, so every endpoint is in every SDK.",
      href: "/docs/sdks",
      demo: <Languages />,
    },
    {
      title: "Keep the library you use",
      body: "Drop-ins for Nodemailer, Better Auth and Auth.js, and mail drivers for Laravel, Rails and Django.",
      href: "/docs/integrations",
      demo: <DropIns />,
    },
    {
      title: "A CLI for the same API",
      body: "Set a project up, follow logs and forward webhooks to localhost. No Node.js needed.",
      href: "/docs/cli",
      demo: <Terminal />,
    },
    {
      title: "Installed in one line",
      body: "The TypeScript SDK has zero dependencies and runs on Node.js, Bun, Deno and Cloudflare Workers. All are MIT licensed.",
      href: "/docs/sdks",
      demo: <Installs />,
    },
  ],
};
