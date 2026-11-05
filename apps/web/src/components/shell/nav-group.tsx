"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@coss/ui/components/sidebar";
import Link from "next/link";
import type { NavItem } from "@/lib/navigation";

/**
 * A labelled group of sidebar links. `active` is the current item, decided by the caller across
 * every group of the area (so only one link is highlighted).
 */
export function NavGroup(props: {
  label?: string;
  base: string;
  items: NavItem[];
  active: NavItem | undefined;
  /** A count beside a page, by its path. */
  badges?: Record<string, number>;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup className="py-1">
      {props.label ? <SidebarGroupLabel>{props.label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {props.items.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.path}>
                <SidebarMenuButton
                  isActive={item === props.active}
                  render={
                    <Link href={props.base + item.path} onNavigate={() => setOpenMobile(false)} />
                  }
                  tooltip={item.label}
                >
                  {Icon ? <Icon /> : null}
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {props.badges?.[item.path] ? (
                  <SidebarMenuBadge>{props.badges[item.path]}</SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
