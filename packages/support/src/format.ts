/**
 * The formatting a support message can carry: paragraphs, lists and fenced code, read the same way
 * by the dashboard and the emails. Text stays text: nothing here produces markup. Client-safe.
 */
export type SupportBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "code"; text: string };

const FENCE = /^```/;
const LIST_ITEM = /^\s*[-*]\s+(.*)$/;

export function parseSupportText(input: string): SupportBlock[] {
  const blocks: SupportBlock[] = [];
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    const text = paragraph.join("\n").trim();
    if (text) blocks.push({ type: "paragraph", text });
    paragraph = [];
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (FENCE.test(line)) {
      flush();
      const code: string[] = [];
      index++;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index++;
      }
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const last = blocks.at(-1);
      if (last?.type === "list") last.items.push(item[1] ?? "");
      else blocks.push({ type: "list", items: [item[1] ?? ""] });
      continue;
    }
    if (line.trim() === "") flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

export type SupportInline =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; url: string };

/** Splits text into plain runs, `inline code` and https links. */
export function parseSupportInline(text: string): SupportInline[] {
  const parts: SupportInline[] = [];
  const pattern = /`([^`\n]+)`|(https?:\/\/[^\s<>"']+)/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > position) parts.push({ type: "text", text: text.slice(position, start) });
    if (match[1] !== undefined) {
      parts.push({ type: "code", text: match[1] });
      position = start + match[0].length;
      continue;
    }
    // Sentence punctuation after a link isn't part of it.
    const linked = match[2] ?? "";
    let end = linked.length;
    while (end > 0 && ".,;:!?)]".includes(linked[end - 1] as string)) end--;
    const url = linked.slice(0, end);
    parts.push({ type: "link", url });
    position = start + url.length;
  }
  if (position < text.length) parts.push({ type: "text", text: text.slice(position) });
  return parts;
}
