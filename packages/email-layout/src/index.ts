/**
 * coss.com's own emails (account emails, notifications to owners and admins): one layout, built
 * from typed blocks, rendered to a plain-text part and an HTML part that say the same thing.
 * Zero dependencies and no I/O, so any package can render with it (auth included).
 *
 * Every string is text, never markup: the renderer escapes it. Names that come from customers
 * (organizations, businesses) go through `oneLine` before they reach a subject.
 */

/** A step of a process the email reports on (a registration's review, a DMARC rollout). */
export type EmailStep = {
  label: string;
  detail?: string;
  state: "done" | "current" | "upcoming" | "failed";
};

export type EmailBlock =
  /** A section heading inside the email (the email's own title is `title`). */
  | { heading: string }
  | { paragraph: string }
  | { list: string[] }
  /** The email's call to action: a button. Use one per email. */
  | { button: { label: string; url: string } }
  /** A secondary link, as text. */
  | { link: { label: string; url: string } }
  /** Something to copy (a DNS record, an SDK call), in a monospaced box. */
  | { code: string }
  /** Label/value pairs (a number, a business, a date). */
  | { details: { label: string; value: string }[] }
  /** Labels above values that may run long or over several lines (a form's answers). */
  | { fields: { label: string; value: string }[] }
  /** A one-time code, large. Never in a subject or preview: both outlive the body. */
  | { passcode: string }
  /** Someone's own words, set apart from ours. */
  | { quote: string }
  | { steps: EmailStep[] }
  /** Small print under the main content. */
  | { note: string };

export type EmailMessage = { subject: string; text: string; html: string };

/** `src` is inline (`cid:…`), so opening the email tells nobody; width and height are the image's own. */
export type EmailLogo = { src: string; width: number; height: number };

export type EmailAccent = { background: string; foreground: string };

export type EmailContent = {
  subject: string;
  /** The heading at the top of the email; defaults to the subject. */
  title?: string;
  /** One line under the title: who it's from, which ticket. */
  subtitle?: string;
  /** Replaces the plate and wordmark and loads nothing from coss.com: only for a customer's own address. */
  brand?: string | undefined;
  /** Shown instead of `brand`'s text, which becomes its alt text. Only with `brand`. */
  logo?: EmailLogo | undefined;
  /** The button's colors. Only with `brand`. */
  accent?: EmailAccent | undefined;
  /** The inbox preview line (hidden in the body); defaults to the first paragraph. */
  preview?: string;
  blocks: EmailBlock[];
  /** Why the recipient gets this email, under the content. */
  reason?: string;
};

/** Customer-provided text on one line: no control or separator characters, single spaces. */
export function oneLine(value: string): string {
  return value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmail(content: EmailContent): EmailMessage {
  const subject = oneLine(content.subject);
  return { subject, text: toText(content), html: toHtml(subject, content) };
}

// ---------------------------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------------------------

const STEP_MARK = { done: "[x]", current: "[>]", upcoming: "[ ]", failed: "[!]" } as const;

function blockText(block: EmailBlock): string {
  if ("heading" in block) return block.heading.toUpperCase();
  if ("paragraph" in block) return block.paragraph;
  if ("list" in block) return block.list.map((item) => `- ${item}`).join("\n");
  if ("button" in block) return `${block.button.label}: ${block.button.url}`;
  if ("link" in block) return `${block.link.label}: ${block.link.url}`;
  if ("code" in block) return block.code;
  if ("details" in block) {
    return block.details.map((row) => `${row.label}: ${row.value}`).join("\n");
  }
  if ("fields" in block) {
    return block.fields.map((row) => `${row.label}:\n${row.value}`).join("\n\n");
  }
  if ("passcode" in block) return block.passcode;
  if ("quote" in block) return block.quote;
  if ("steps" in block) {
    return block.steps
      .map(
        (step, index) =>
          `${STEP_MARK[step.state]} ${index + 1}. ${step.label}${step.detail ? ` (${step.detail})` : ""}`,
      )
      .join("\n");
  }
  return block.note;
}

function toText(content: EmailContent): string {
  const parts = [
    content.title ?? content.subject,
    ...(content.subtitle ? [content.subtitle] : []),
    ...content.blocks.map(blockText),
  ];
  if (content.reason) parts.push(`--\n${content.reason}`);
  return parts.join("\n\n");
}

// Tables and inline styles reach every client; the plate's dots, Cal Sans and phone styles are extras.

// apps/site/public/site-assets/email: cached by the CDN, so a changed file needs a new name.
const ASSETS = "https://coss.com/site-assets/email";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Set at 500: from 600, a single-weight Cal Sans installed locally gets a synthetic bold.
const DISPLAY = `'Cal Sans',${FONT}`;
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const INK = "#18181b";
const PLATE = "#0c0c0e";
const PLATE_DOT = "#3a3a40";
const PLATE_MUTED = "#a1a1aa";
const MUTED = "#63636b";
const BORDER = "#e4e4e7";
const PAPER = "#f4f4f5";
const FAILED = "#b91c1c";
const LONG_TITLE = 60;
const LOGO_MAX_WIDTH = 200;
const LOGO_MAX_HEIGHT = 48;
const DEFAULT_ACCENT: EmailAccent = { background: PLATE, foreground: "#ffffff" };

// Separate tags: Gmail drops a whole <style> over a rule it refuses, and it refuses @font-face.
const FONT_STYLE = `<style>
@font-face{font-family:'Cal Sans';src:url(${ASSETS}/cal-sans.woff2) format('woff2');font-weight:100 900;font-style:normal}
</style>`;
const PHONE_STYLE = `<style>
@media (max-width:600px){
.coss-outer{padding:16px 8px 24px !important}
.coss-plate{padding:24px 24px 28px !important}
.coss-brand{padding:24px 24px 0 !important}
.coss-title{font-size:26px !important;line-height:32px !important}
.coss-content{padding:24px 24px 8px !important}
.coss-footer{padding:20px 24px 0 !important}
.coss-passcode{font-size:26px !important;line-height:34px !important;letter-spacing:4px !important}
}
</style>`;

const STEP_DOT = {
  done: { mark: "&#10003;", color: "#ffffff", background: PLATE, border: PLATE },
  current: { mark: "&#9679;", color: INK, background: "#ffffff", border: INK },
  upcoming: { mark: "", color: MUTED, background: "#ffffff", border: BORDER },
  failed: { mark: "&#10005;", color: "#ffffff", background: FAILED, border: FAILED },
} as const;

function paragraph(html: string, style = ""): string {
  return `<p style="margin:0 0 18px;font-size:15px;line-height:25px;color:${INK};${style}">${html}</p>`;
}

function stepsHtml(steps: EmailStep[]): string {
  const rows = steps.map((step, index) => {
    const dot = STEP_DOT[step.state];
    const rail =
      index < steps.length - 1
        ? `background-image:linear-gradient(${BORDER},${BORDER});background-repeat:no-repeat;background-position:11px 0;background-size:1px 100%;`
        : "";
    const detail = step.detail
      ? `<div style="font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(step.detail)}</div>`
      : "";
    return (
      `<tr><td width="23" style="width:23px;padding:0 0 18px;vertical-align:top;${rail}">` +
      `<div style="width:21px;height:21px;border:1px solid ${dot.border};border-radius:12px;background-color:${dot.background};color:${dot.color};font-size:11px;line-height:21px;text-align:center">${dot.mark}</div></td>` +
      `<td style="padding:1px 0 18px 12px;vertical-align:top">` +
      `<div style="font-size:14px;line-height:21px;font-weight:600;color:${step.state === "upcoming" ? MUTED : INK}">${escapeHtml(step.label)}</div>` +
      `${detail}</td></tr>`
    );
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px">${rows.join("")}</table>`;
}

function ruledTable(rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border-top:1px solid ${INK};border-bottom:1px solid ${BORDER}">${rows.join("")}</table>`;
}

function detailsHtml(details: { label: string; value: string }[]): string {
  const rows = details.map((row, index) => {
    const rule = index ? `border-top:1px solid ${BORDER};` : "";
    return (
      `<tr><td style="padding:12px 16px 12px 0;${rule}font-size:14px;line-height:20px;color:${MUTED};vertical-align:top">${escapeHtml(row.label)}</td>` +
      `<td align="right" style="padding:12px 0;${rule}font-size:14px;line-height:20px;font-weight:500;color:${INK};text-align:right;vertical-align:top;word-break:break-word">${escapeHtml(row.value)}</td></tr>`
    );
  });
  return ruledTable(rows);
}

function fieldsHtml(fields: { label: string; value: string }[]): string {
  const rows = fields.map((row, index) => {
    const rule = index ? `border-top:1px solid ${BORDER};` : "";
    return (
      `<tr><td style="padding:12px 0;${rule}">` +
      `<div style="margin:0 0 2px;font-size:13px;line-height:20px;color:${MUTED}">${escapeHtml(row.label)}</div>` +
      `<div style="font-size:15px;line-height:23px;color:${INK};white-space:pre-wrap;word-break:break-word">${escapeHtml(row.value)}</div>` +
      `</td></tr>`
    );
  });
  return ruledTable(rows);
}

function blockHtml(block: EmailBlock, accent: EmailAccent): string {
  if ("heading" in block) {
    return `<h2 style="margin:30px 0 8px;font-family:${DISPLAY};font-size:17px;line-height:24px;font-weight:500;color:${INK}">${escapeHtml(block.heading)}</h2>`;
  }
  if ("paragraph" in block) return paragraph(escapeHtml(block.paragraph));
  if ("list" in block) {
    const items = block.list
      .map((item) => `<li style="margin:0 0 6px">${escapeHtml(item)}</li>`)
      .join("");
    return `<ul style="margin:0 0 18px;padding:0 0 0 20px;font-size:15px;line-height:25px;color:${INK}">${items}</ul>`;
  }
  if ("button" in block) {
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 28px"><tr>` +
      `<td bgcolor="${escapeHtml(accent.background)}" style="border-radius:10px;background-color:${escapeHtml(accent.background)}">` +
      `<a href="${escapeHtml(block.button.url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${escapeHtml(accent.foreground)};text-decoration:none;border-radius:10px">${escapeHtml(block.button.label)}</a>` +
      `</td></tr></table>`
    );
  }
  if ("link" in block) {
    return paragraph(
      `<a href="${escapeHtml(block.link.url)}" style="color:${INK};font-weight:500;text-decoration:underline;text-underline-offset:3px">${escapeHtml(block.link.label)}</a>`,
    );
  }
  if ("code" in block) {
    return `<pre style="margin:6px 0 22px;padding:16px 18px;border-radius:10px;background-color:${PLATE};font-family:${MONO};font-size:13px;line-height:21px;color:#fafafa;white-space:pre-wrap;word-break:break-all"><code style="font-family:${MONO};color:#fafafa">${escapeHtml(block.code)}</code></pre>`;
  }
  if ("details" in block) return detailsHtml(block.details);
  if ("fields" in block) return fieldsHtml(block.fields);
  if ("passcode" in block) {
    return (
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px"><tr>` +
      `<td class="coss-passcode" align="center" bgcolor="${PAPER}" style="padding:22px 12px;word-break:break-all;border-radius:10px;background-color:${PAPER};font-family:${MONO};font-size:36px;line-height:44px;font-weight:600;letter-spacing:8px;color:${INK}">${escapeHtml(block.passcode)}</td>` +
      `</tr></table>`
    );
  }
  if ("quote" in block) {
    return `<div style="margin:6px 0 24px;padding:16px 18px;border-radius:10px;background-color:${PAPER};font-size:15px;line-height:24px;color:${INK};white-space:pre-wrap;word-break:break-word">${escapeHtml(block.quote)}</div>`;
  }
  if ("steps" in block) return stepsHtml(block.steps);
  return paragraph(escapeHtml(block.note), `font-size:13px;line-height:20px;color:${MUTED}`);
}

function logoHtml(logo: EmailLogo, alt: string): string {
  const scale = Math.min(1, LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height);
  const width = Math.round(logo.width * scale);
  const height = Math.round(logo.height * scale);
  return `<img src="${escapeHtml(logo.src)}" width="${width}" height="${height}" alt="${escapeHtml(alt)}" style="display:block;width:${width}px;height:${height}px;max-width:100%;border:0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:600;color:${INK}">`;
}

/** A customer's own email: their name or logo on white, and none of coss.com's plate. */
function brandedHeader(input: {
  brand: string;
  logo: EmailLogo | undefined;
  title: string;
  subtitle: string | undefined;
}): string {
  const mark = input.logo
    ? logoHtml(input.logo, input.brand)
    : `<p style="margin:0;font-size:18px;line-height:24px;font-weight:600;color:${INK};word-break:break-word">${escapeHtml(input.brand)}</p>`;
  const subtitle = input.subtitle
    ? `<p style="margin:8px 0 0;font-size:14px;line-height:20px;color:${MUTED}">${escapeHtml(input.subtitle)}</p>`
    : "";
  return (
    `<tr><td class="coss-brand" style="padding:32px 40px 0;font-family:${FONT}">\n${mark}\n` +
    `<h1 style="margin:28px 0 0;font-size:24px;line-height:30px;font-weight:600;color:${INK};word-break:break-word">${escapeHtml(input.title)}</h1>\n${subtitle}\n</td></tr>`
  );
}

function toHtml(subject: string, content: EmailContent): string {
  const firstParagraph = content.blocks.find((block) => "paragraph" in block);
  const preview =
    content.preview ??
    (firstParagraph && "paragraph" in firstParagraph ? firstParagraph.paragraph : undefined) ??
    content.subtitle ??
    "";
  const title = content.title ?? subject;
  const long = title.length > LONG_TITLE;
  const titleSize = long ? "font-size:24px;line-height:30px" : "font-size:32px;line-height:38px";
  const brand = oneLine(content.brand ?? "");
  const accent = (brand ? content.accent : undefined) ?? DEFAULT_ACCENT;
  const body = content.blocks.map((block) => blockHtml(block, accent)).join("\n");
  const subtitle = content.subtitle
    ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${PLATE_MUTED}">${escapeHtml(content.subtitle)}</p>`
    : "";
  const masthead = `<a href="https://coss.com" style="color:#ffffff;text-decoration:none"><img src="${ASSETS}/wordmark.png" width="95" height="24" alt="coss.com" style="display:block;width:95px;height:24px;border:0;font-family:${FONT};font-size:14px;line-height:24px;font-weight:700;color:#ffffff"></a>`;
  const header = brand
    ? brandedHeader({ brand, logo: content.logo, title, subtitle: content.subtitle })
    : `<tr><td class="coss-plate" bgcolor="${PLATE}" style="padding:28px 40px 36px;border-radius:15px 15px 0 0;background-color:${PLATE};background-image:radial-gradient(circle at center,${PLATE_DOT} 1px,${PLATE} 1.2px);background-size:24px 24px;background-position:center;font-family:${FONT}">
${masthead}
<h1${long ? "" : ' class="coss-title"'} style="margin:44px 0 0;font-family:${DISPLAY};${titleSize};font-weight:500;color:#ffffff;word-break:break-word">${escapeHtml(title)}</h1>
${subtitle}
</td></tr>`;
  const footer = content.reason
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px"><tr><td class="coss-footer" style="padding:20px 41px 0;font-family:${FONT}"><p style="margin:0;font-size:12px;line-height:18px;color:${MUTED}">${escapeHtml(content.reason)}</p></td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
${brand ? "" : `${FONT_STYLE}\n`}${PHONE_STYLE}
</head>
<body bgcolor="${PAPER}" style="margin:0;padding:0;background-color:${PAPER};font-family:${FONT};color:${INK}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAPER}" style="background-color:${PAPER}">
<tr><td class="coss-outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:separate;border:1px solid ${BORDER};border-radius:16px;background-color:#ffffff">
${header}
<tr><td class="coss-content" style="padding:32px 40px 14px;font-family:${FONT}">
${body}
</td></tr>
</table>
${footer}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
