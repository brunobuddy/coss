"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@coss/ui/components/sidebar";
import { ArrowLeftIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ACCOUNT_NAV, ADMIN_NAV, activeNavItem } from "@/lib/navigation";
import { NavGroup } from "./nav-group";
import { SidebarDocsLink, SidebarLink, SidebarWordmark } from "./sidebar-parts";
import { type ShellUser, UserNav } from "./user-nav";

const AREAS = {
  account: { base: "/settings", groupLabel: "Account", items: ACCOUNT_NAV },
  admin: { base: "/admin", groupLabel: "Console", items: ADMIN_NAV },
};

/**
 * The sidebar of an area outside organizations (account settings, the admin console): the
 * wordmark (with the area's label), a way back to the dashboard, the area's pages.
 */
export function AreaSidebar(props: {
  area: keyof typeof AREAS;
  label?: ReactNode;
  back: { href: string; label: string };
  user: ShellUser;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  // Picked here, not passed in: the items' icons are components, which can't cross from a
  // server layout into this client component.
  const { base, groupLabel, items } = AREAS[props.area];
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="gap-3">
        <SidebarWordmark label={props.label} />
        <SidebarLink href={props.back.href} icon={<ArrowLeftIcon />}>
          {props.back.label}
        </SidebarLink>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup
          active={activeNavItem(pathname, base, items)}
          badges={props.badges}
          base={base}
          items={items}
          label={groupLabel}
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarDocsLink />
        <UserNav user={props.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
