import { agents } from "./agents";
import { email } from "./email";
import { forms } from "./forms";
import { hooks } from "./hooks";
import { inboundEmail } from "./inbound-email";
import { inboxes } from "./inboxes";
import { marketingEmail } from "./marketing-email";
import { platform } from "./platform";
import { rateLimiting } from "./rate-limiting";
import { risk } from "./risk";
import { scheduling } from "./scheduling";
import { sdks } from "./sdks";
import { security } from "./security";
import { sign } from "./sign";
import { sms } from "./sms";
import { smtp } from "./smtp";
import { subaccounts } from "./subaccounts";
import type { ProductShowcase } from "./types";
import { verify } from "./verify";

/** Every product page's showcase, by slug (`test/marketing.test.ts` checks there's one for each). */
export const SHOWCASES: Record<string, ProductShowcase> = {
  email,
  "marketing-email": marketingEmail,
  inboxes,
  "inbound-email": inboundEmail,
  subaccounts,
  smtp,
  sms,
  verify,
  sign,
  forms,
  scheduling,
  hooks,
  risk,
  "rate-limiting": rateLimiting,
  platform,
  security,
  agents,
  sdks,
};

export type { Highlight, ProductShowcase } from "./types";
