import Link from "next/link";
import type { DocsSection, NavPage } from "@/lib/docs-tree";
import { SectionIcon } from "./section-icon";

/**
 * `<DocsSections />` on the docs' home page: every section with what it covers and where its parts
 * start (its labelled groups, else its pages), one ruled row each. Built from the page tree, so it
 * lists exactly what the sidebar does.
 */
export function DocsSections({ sections, current }: { sections: DocsSection[]; current: string }) {
  return (
    <div className="not-prose my-8 border-border/64 border-t">
      {sections.map((section) => (
        <section
          className="grid gap-x-8 gap-y-3 border-border/64 border-b py-5 sm:grid-cols-2"
          key={section.key}
        >
          <div className="flex flex-col gap-1">
            <Link
              className="flex items-center gap-2 font-medium text-foreground hover:underline hover:underline-offset-4"
              href={section.url}
            >
              <SectionIcon className="size-4 shrink-0 text-muted-foreground" name={section.icon} />
              {section.name}
            </Link>
            {section.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">{section.description}</p>
            )}
          </div>
          <ul className="flex flex-wrap content-start gap-x-4 gap-y-1.5 text-sm">
            {sectionParts(section)
              .filter((part) => part.url !== current)
              .map((part) => (
                <li key={part.url}>
                  <Link
                    className="text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                    href={part.url}
                  >
                    {part.name}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * `<ApiOperations />` on the API reference's overview: every endpoint, by product and resource.
 * The sidebar renders a closed resource's links only in the browser, so this is the page that
 * links them all in the HTML.
 */
export function ApiOperations({ section }: { section?: DocsSection }) {
  return (
    <div className="not-prose my-6 flex flex-col gap-8">
      {section?.groups
        .filter((group) => group.entries.some((entry) => entry.type === "folder"))
        .map((group) => (
          <section className="flex flex-col gap-4" key={group.key}>
            <h3 className="font-medium text-foreground">{group.label}</h3>
            {group.entries.map((entry) =>
              entry.type === "folder" ? (
                <div className="grid gap-x-8 gap-y-2 sm:grid-cols-[10rem_1fr]" key={entry.key}>
                  <p className="text-muted-foreground text-sm">{entry.name}</p>
                  <ul className="flex flex-wrap content-start gap-x-4 gap-y-1.5 text-sm">
                    {entry.pages.map((page) => (
                      <li key={page.url}>
                        <Link
                          className="text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                          href={page.url}
                        >
                          {page.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </section>
        ))}
    </div>
  );
}

/** `<ApiOperations />` as Markdown. */
export function operationsMarkdown(section?: DocsSection): string {
  return (section?.groups ?? [])
    .flatMap((group) =>
      group.entries.flatMap((entry) =>
        entry.type === "folder"
          ? [
              `- **${String(entry.name)}**: ${entry.pages
                .map((page) => `[${String(page.name)}](${page.url})`)
                .join(", ")}`,
            ]
          : [],
      ),
    )
    .join("\n");
}

/** Where a section's parts start: its labelled groups, else (one plain list) its pages. */
export function sectionParts(section: DocsSection): NavPage[] {
  const labelled = section.groups.filter((group) => group.label && group.pages[0]);
  if (labelled.length === 0) return section.groups.flatMap((group) => group.pages);
  return labelled.map((group) => ({ name: group.label, url: group.pages[0]?.url ?? "" }));
}

/** `<DocsSections />` as Markdown, for /llms*.txt and "Copy Markdown". */
export function sectionsMarkdown(sections: DocsSection[]): string {
  return sections
    .map((section) => {
      const parts = sectionParts(section)
        .map((part) => `[${String(part.name)}](${part.url})`)
        .join(", ");
      return `- [${String(section.name)}](${section.url}): ${String(section.description ?? "")} ${parts}`;
    })
    .join("\n");
}
