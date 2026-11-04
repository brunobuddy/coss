/**
 * The sheet components of these pages (src/components/marketing-mdx.tsx) as plain Markdown:
 * sections become `##` headings with their lede, features `###` headings, specs a list.
 */
export function renderSheetComponents(markdown: string): string {
  const attribute = (tag: string, name: string) =>
    new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
  return markdown
    .replace(/<HeroSample>[\s\S]*?<\/HeroSample>\s*/g, "")
    .replace(/<Section\b[^>]*>/g, (tag) => {
      const lede = attribute(tag, "lede");
      return `## ${attribute(tag, "title")}${lede ? `\n\n${lede}` : ""}`;
    })
    .replace(/<Feature\b[^>]*>/g, (tag) => `### ${attribute(tag, "title")}`)
    .replace(
      /<Spec\b[^>]*>([\s\S]*?)<\/Spec>/g,
      (match, value: string) =>
        `- ${attribute(match.slice(0, match.indexOf(">") + 1), "label")}: ${value.trim()}`,
    )
    .replace(/<\/?(Section|Features|Feature|Specs)\b[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}
