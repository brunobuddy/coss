import type { SetupStep } from "@/components/setup-steps";

type DomainLike = { canSend: boolean };

/**
 * What's left to set up in an environment, for its Home. A sandbox delivers nothing, so its last
 * step leads out of it, to the domains of the project's live environment (`liveBase`).
 */
export function environmentSetupSteps(input: {
  base: string;
  keyPrefix: string;
  live: boolean;
  hasKey: boolean;
  hasActivity: boolean;
  /** `null`: this member can't read domains. */
  domains: readonly DomainLike[] | null;
  liveBase: string | null;
}): SetupStep[] {
  const { base, domains, liveBase } = input;
  const canSend = (domains ?? []).some((domain) => domain.canSend);
  const key: SetupStep = {
    label: "Create an API key",
    description: `One key reaches every product. This environment's start with ${input.keyPrefix}.`,
    done: input.hasKey,
    href: `${base}/developers/api-keys`,
  };
  const request: SetupStep = {
    label: "Make your first request",
    description: "Send an email or a text, request a signature, assess a sign-up…",
    done: input.hasActivity,
    href: `${base}/developers`,
  };
  if (input.live) {
    return domains
      ? [
          key,
          {
            label: "Verify a domain",
            description: "Live email goes out from your own domain.",
            done: canSend,
            href: `${base}/email/domains`,
          },
          request,
        ]
      : [key, request];
  }
  return domains && liveBase
    ? [
        key,
        request,
        {
          label: "Go live",
          description:
            "Nothing leaves a sandbox. Verify a domain in Production to send real email.",
          done: canSend,
          href: `${liveBase}/email/domains`,
        },
      ]
    : [key, request];
}

/** Nothing has happened here yet: no key, no activity. Greetings shouldn't say otherwise. */
export function isFirstVisit(input: { hasKey: boolean; hasActivity: boolean }): boolean {
  return !input.hasKey && !input.hasActivity;
}
