import { descriptionParts } from "@coss/scheduling/description-links";

/**
 * Plain text the customer wrote, never treated as HTML. Its links are the ones the API checked when
 * it was saved, split the same way, so only those are clickable.
 */
export function EventTypeDescription(props: { text: string }) {
  return (
    <p className="wrap-anywhere whitespace-pre-line text-pretty text-muted-foreground text-sm">
      {descriptionParts(props.text).map((part, index) =>
        part.kind === "link" ? (
          <a
            className="underline underline-offset-2"
            href={part.href}
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order.
            key={index}
            rel="noopener noreferrer nofollow"
            target="_blank"
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}
