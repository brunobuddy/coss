import type { Metadata } from "next";
import { StatusDot } from "@/components/marketing/demo";
import { Hero, Page, Tray } from "@/components/marketing/kit";
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
    <Page>
      <Hero
        headline={
          down.length === 0
            ? "Everything is answering."
            : `${down.map((service) => service.name).join(" and ")} ${down.length === 1 ? "isn't" : "aren't"} answering.`
        }
        lede={
          <p>
            Checked{" "}
            <time className="font-mono text-base" dateTime={checkedAt.toISOString()}>
              {checkedAt.toISOString().replace("T", " ").slice(0, 19)} UTC
            </time>
          </p>
        }
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-16 sm:pb-24">
          <Tray flush>
            <ul className="flex flex-col">
              {services.map((service) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-4 py-3.5 last:border-b-0 sm:px-5"
                  key={service.name}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{service.name}</span>
                    <span className="text-muted-foreground text-sm">{service.description}</span>
                  </div>
                  <StatusDot
                    className="shrink-0 font-mono text-[0.8125rem] tabular-nums"
                    tone={service.up ? "success" : "error"}
                  >
                    {service.up ? `Up, ${service.latencyMs} ms` : "No answer"}
                  </StatusDot>
                </li>
              ))}
            </ul>
          </Tray>
          <p className="mx-auto max-w-prose text-pretty text-center text-muted-foreground text-sm">
            This page asks each service's health endpoint from coss.com's own servers, at most every
            30 seconds. It shows only whether they answer right now: it keeps no history, it doesn't
            test the database or message delivery, and an outage of coss.com's own servers can take
            this page down with them. If something looks wrong, write to{" "}
            <a className="underline underline-offset-4" href="mailto:support@coss.com">
              support@coss.com
            </a>
            .
          </p>
        </div>
      </Hero>
    </Page>
  );
}
