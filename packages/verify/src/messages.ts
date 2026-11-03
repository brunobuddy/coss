/**
 * The messages codes go out in. Fixed wording (carriers approve coss.com's shared numbers for
 * exactly this), named after the customer's app; never anything else the request says.
 */
import { type EmailContent, renderEmail } from "@coss/email-layout";

/** The SMS text: one GSM-7 segment for any app name up to `MAX_APP_NAME_LENGTH`. */
export function verifySmsText(appName: string, code: string): string {
  return `Your ${appName} verification code is ${code}. Don't share it with anyone.`;
}

/** `cossHtml` is what coss.com's address sends, including when the customer's stops working. */
export type VerifyEmailContent = { subject: string; text: string; html: string; cossHtml: string };

export function verifyEmailContent(
  appName: string,
  code: string,
  ttlSeconds: number,
  opts: { ownSender: boolean },
): VerifyEmailContent {
  const minutes = Math.max(1, Math.round(ttlSeconds / 60));
  const expiry = `It expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  const content: EmailContent = {
    // Never the code: an email's subject is kept (and goes into its events) after the body is gone.
    subject: `Your ${appName} verification code`,
    preview: expiry,
    blocks: [
      { passcode: code },
      { paragraph: `${expiry} If you didn't ask for it, you can ignore this email.` },
    ],
  };
  const coss = renderEmail(content);
  return {
    ...coss,
    html: opts.ownSender ? renderEmail({ ...content, brand: appName }).html : coss.html,
    cossHtml: coss.html,
  };
}
