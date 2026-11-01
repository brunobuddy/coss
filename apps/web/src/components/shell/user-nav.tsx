"use client";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@coss/ui/components/menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@coss/ui/components/sidebar";
import { ChevronsUpDownIcon, LogOutIcon, SettingsIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { postAuth } from "@/lib/auth-post";

/** `image` is `avatarUrl(session.user)` (`@/lib/avatars`). */
export type ShellUser = { name: string; email: string; image: string | null; isAdmin: boolean };

/**
 * The signed-in user at the foot of the sidebar: account settings (where the theme is chosen), the
 * admin console (platform admins) and sign out.
 */
export function UserNav({ user, compact }: { user: ShellUser; compact?: boolean }) {
  const router = useRouter();
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu className={compact ? "items-center" : undefined}>
      <SidebarMenuItem>
        <Menu>
          {compact ? (
            <MenuTrigger
              render={
                <SidebarMenuButton
                  className="size-8 justify-center p-0 data-popup-open:bg-sidebar-accent"
                  tooltip={{ children: user.name || user.email, hidden: isMobile }}
                />
              }
            >
              <UserAvatar
                className="size-7 rounded-lg border bg-background"
                fallbackClassName="rounded-lg bg-transparent"
                user={user}
              />
              <span className="sr-only">{user.name || user.email}</span>
            </MenuTrigger>
          ) : (
            <MenuTrigger
              render={<SidebarMenuButton className="data-popup-open:bg-sidebar-accent" size="lg" />}
            >
              <UserAvatar
                className="size-8 rounded-lg border bg-background"
                fallbackClassName="rounded-lg bg-transparent"
                user={user}
              />
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-medium text-foreground">
                  {user.name || user.email}
                </span>
                <span className="truncate text-muted-foreground text-xs">{user.email}</span>
              </div>
              <ChevronsUpDownIcon className="ms-auto size-4" />
            </MenuTrigger>
          )}
          <MenuPopup align="end" className="min-w-56" side={isMobile ? "top" : "right"}>
            <MenuGroup>
              <MenuGroupLabel>
                <span className="block max-w-56 truncate font-medium text-foreground">
                  {user.name}
                </span>
                <span className="block max-w-56 truncate font-normal">{user.email}</span>
              </MenuGroupLabel>
              <MenuLinkItem render={<Link href="/settings" />}>
                <SettingsIcon />
                Account settings
              </MenuLinkItem>
              {user.isAdmin ? (
                <MenuLinkItem render={<Link href="/admin" />}>
                  <ShieldIcon />
                  Admin console
                </MenuLinkItem>
              ) : null}
            </MenuGroup>
            <MenuSeparator />
            <MenuItem
              onClick={async () => {
                await postAuth("/sign-out");
                router.push("/sign-in");
                router.refresh();
              }}
            >
              <LogOutIcon />
              Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
