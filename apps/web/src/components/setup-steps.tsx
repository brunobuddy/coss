import { cn } from "@coss/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import Link from "next/link";

export type SetupStep = { label: string; description: string; done: boolean; href: string };

/** A numbered checklist, each step linking to where it's done; finished steps are struck through. */
export function SetupSteps(props: { steps: SetupStep[] }) {
  return (
    <ol className="flex flex-col">
      {props.steps.map((step, index) => (
        <li className="border-t first:border-t-0" key={step.label}>
          <Link
            className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
            href={step.href}
          >
            <span
              className={cn(
                "mt-px flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[0.6875rem]",
                step.done
                  ? "border-transparent bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              {step.done ? <CheckIcon className="size-3" /> : index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "font-medium text-sm",
                  step.done && "text-muted-foreground line-through",
                )}
              >
                {step.label}
              </span>
              <span className="text-muted-foreground text-xs">{step.description}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
