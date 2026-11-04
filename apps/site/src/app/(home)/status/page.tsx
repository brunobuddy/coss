import { CheckIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { currentStatus } from "@/lib/status";

// The one dynamic page here: a status from build time would say nothing.
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Status · coss.com",
  description: "Whether coss.com's API and dashboard are answering right now.",
  path: "/status",
});

export default async function StatusPage() {
  const { checkedAt, services } = await currentStatus();
  const down = services.filter((service) => !service.up);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-16 sm:py-24">
      <header className="flex flex-col gap-4">
        <h1 className="text-balance font-semibold text-[clamp(2.5rem,6vw,4rem)] leading-[0.95] tracking-[-0.035em]">
          {down.length === 0
            ? "Everything is answering."
            : `${down.map((service) => service.name).join(" and ")} ${down.length === 1 ? "isn't" : "aren't"} answering.`}
        </h1>
        <p className="text-muted-foreground text-sm">
          Checked{" "}
          <time className="font-mono" dateTime={checkedAt.toISOString()}>
            {checkedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
          </time>
        </p>
      </header>

      <ul className="flex flex-col border-t">
        {services.map((service) => (
          <li className="flex items-center gap-4 border-b py-4" key={service.name}>
            {service.up ? (
              <CheckIcon aria-hidden className="size-5 shrink-0" />
            ) : (
              <XIcon aria-hidden className="size-5 shrink-0" />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{service.name}</span>
              <span className="text-muted-foreground text-sm">{service.description}</span>
            </div>
            <span className="shrink-0 font-mono text-muted-foreground text-sm">
              {service.up ? `Up, ${service.latencyMs} ms` : "No answer"}
            </span>
          </li>
        ))}
      </ul>

      <p className="max-w-prose text-pretty text-muted-foreground text-sm">
        This page asks each service's health endpoint from coss.com's own servers, at most every 30
        seconds. It shows only whether they answer right now: it keeps no history, it doesn't test
        the database or message delivery, and an outage of coss.com's own servers can take this page
        down with them. If something looks wrong, write to{" "}
        <a className="underline underline-offset-2" href="mailto:support@coss.com">
          support@coss.com
        </a>
        .
      </p>
    </main>
  );
}
