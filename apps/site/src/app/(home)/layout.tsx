import { SiteFooter } from "@/components/site-footer";
import { SiteShell } from "@/components/site-shell";

/** The landing, pricing and legal pages: the site's header, the page, the full-width footer. */
export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <SiteShell rails={false}>
      <div className="flex flex-1 flex-col bg-background">{children}</div>
      <SiteFooter />
    </SiteShell>
  );
}
