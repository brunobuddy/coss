import { SidebarInset, SidebarProvider } from "@coss/ui/components/sidebar";
import { cookies } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import type { Session } from "@/lib/auth";
import { ImpersonationBanner } from "../impersonation-banner";
import { AppHeader, type HeaderContext } from "./app-header";
import type { CommandMenuData } from "./command-menu";

/**
 * The signed-in frame, laid out like coss.com's docs: the sidebar on the neutral ground and the
 * page in a raised frame beside it, with the header (breadcrumbs, search) on top. `banners` go
 * above the page at full width. Pages are capped at `max-w-6xl` unless they contain
 * `data-page-width="full"` (the log explorer).
 */
export async function AppShell(props: {
  session: Session;
  sidebar: ReactNode;
  names: Record<string, string>;
  command: CommandMenuData;
  banners?: ReactNode;
  /** The organization's projects: the header starts with the project and environment. */
  context?: HeaderContext;
  children: ReactNode;
}) {
  // coss ui's Sidebar remembers whether it was collapsed in this cookie.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const impersonating = props.session.session.impersonatedBy;

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      // The console's rail and panel side by side are wider than one sidebar.
      style={props.context ? ({ "--sidebar-width": "17rem" } as CSSProperties) : undefined}
    >
      {props.sidebar}
      <SidebarInset className="min-w-0 md:border md:shadow-lg/5 dark:bg-background">
        {impersonating ? (
          <div className="overflow-hidden md:rounded-t-xl">
            <ImpersonationBanner email={props.session.user.email} />
          </div>
        ) : null}
        <AppHeader command={props.command} context={props.context} names={props.names} />
        <div className="flex flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 has-data-[page-width=full]:max-w-none">
            {props.banners}
            {props.children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
