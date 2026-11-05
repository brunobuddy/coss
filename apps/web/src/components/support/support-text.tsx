import { parseSupportInline, parseSupportText } from "@coss/support/format";

function Inline(props: { text: string }) {
  return parseSupportInline(props.text).map((part, index) => {
    const key = `${part.type}-${index}`;
    if (part.type === "code") {
      return (
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8125rem]" key={key}>
          {part.text}
        </code>
      );
    }
    if (part.type === "link") {
      return (
        <a
          className="underline underline-offset-2 [overflow-wrap:anywhere]"
          href={part.url}
          key={key}
          rel="noopener noreferrer nofollow"
          target="_blank"
        >
          {part.url}
        </a>
      );
    }
    return <span key={key}>{part.text}</span>;
  });
}

/** What someone wrote: paragraphs, lists and code, never markup. */
export function SupportText(props: { text: string }) {
  const blocks = parseSupportText(props.text);
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words text-sm leading-relaxed">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "code") {
          return (
            <pre
              className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.8125rem] leading-relaxed"
              key={key}
            >
              {block.text}
            </pre>
          );
        }
        if (block.type === "list") {
          return (
            <ul className="flex list-disc flex-col gap-1 ps-5" key={key}>
              {block.items.map((item, position) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a list's items never move.
                <li key={position}>
                  <Inline text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p className="whitespace-pre-wrap" key={key}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
