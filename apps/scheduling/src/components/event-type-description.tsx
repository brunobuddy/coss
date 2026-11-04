const HTTPS_LINK = /(https:\/\/[^\s<>"']+)/;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * Plain text the customer wrote, with their `https` links clickable. The API only stores links to
 * their verified domains. It's never treated as HTML.
 */
export function EventTypeDescription(props: { text: string }) {
  return (
    <p className="whitespace-pre-line text-pretty text-muted-foreground text-sm">
      {props.text.split(HTTPS_LINK).map((part, index) => {
        if (index % 2 === 0) return part;
        const href = part.replace(TRAILING_PUNCTUATION, "");
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string, in order.
          <span key={index}>
            <a
              className="underline underline-offset-2"
              href={href}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              {href}
            </a>
            {part.slice(href.length)}
          </span>
        );
      })}
    </p>
  );
}
