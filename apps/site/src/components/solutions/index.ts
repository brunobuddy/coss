import { aiAgents } from "./ai-agents";
import { authentication } from "./authentication";
import { booking } from "./booking";
import { contactForms } from "./contact-forms";
import { notifications } from "./notifications";
import { phoneVerification } from "./phone-verification";
import { platforms } from "./platforms";
import type { SolutionShowcase } from "./types";

/** Every solution page's showcase, by slug. */
export const SOLUTION_SHOWCASES: Record<string, SolutionShowcase> = {
  "ai-agents": aiAgents,
  authentication,
  booking,
  "contact-forms": contactForms,
  notifications,
  "phone-verification": phoneVerification,
  platforms,
};

export type { SolutionShowcase, SolutionStep } from "./types";
