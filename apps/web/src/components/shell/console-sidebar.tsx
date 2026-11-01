"use client";

import {
  type DashboardPage,
  type DashboardSection,
  DEVELOPERS,
  ORGANIZATION_SETTINGS,
  PRODUCTS,
  type Product,
  type ProductKey,
  type ProductPreferences,
  sectionOf,
  settingsHref,
  visibleProducts,
} from "@coss/dashboard-routes";
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
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@coss/ui/components/sidebar";
import { cn } from "@coss/ui/lib/utils";
import {
  BookOpenIcon,
  CheckIcon,
  EllipsisIcon,
  HouseIcon,
  LayoutGridIcon,
  type LucideIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { setProductPreferenceAction } from "@/app/[orgSlug]/actions";
import { OrganizationAvatar } from "@/components/organization-avatar";
import {
  activeNavItem,
  DEVELOPERS_ICON,
  environmentPath,
  ORGANIZATION_ICON,
  PRODUCT_ICONS,
} from "@/lib/navigation";
import { rememberEnvironment } from "@/lib/remembered-environment";
import { useActionToast } from "@/lib/toast";
import { ActiveIndicator, useActiveIndicator } from "./active-indicator";
import { SidebarWordmark } from "./sidebar-parts";
import type { ShellOrganization, ShellProject } from "./types";
import { type ShellUser, UserNav } from "./user-nav";

export type ConsoleSidebarProps = {
  organization: ShellOrganization & { role: string };
  organizations: ShellOrganization[];
  projects: ShellProject[];
  /** The environment to use outside one (organization settings): the last one opened. */
  fallback: { project: string; environment: string } | null;
  /** Products in use, by `<project>/<environment>`. */
  inUse: Record<string, ProductKey[]>;
  preferences: ProductPreferences;
  /** The organization settings pages the member may open. */
  settingsPaths: string[];
  user: ShellUser;
};

type Area =
  | { kind: "home" | "catalog" | "developers" | "organization" }
  | { kind: "product"; product: Product };

/**
 * The dashboard's sidebar: a rail of the member's products (what the environment uses, plus what
 * they pinned) beside a panel with the current product's pages. The rail stays when it collapses.
 */
export function ConsoleSidebar(props: ConsoleSidebarProps) {
  const current = usePathname();
  // Where a sidebar link is taking us: the highlight and panel follow the click, not the response.
  const [pending, setPending] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new pathname ends the navigation.
  useEffect(() => setPending(null), [current]);
  const pathname = pending ?? current;
  const params = useParams<{ projectSlug?: string; envSlug?: string }>();
  const orgSlug = props.organization.slug;
  const projectSlug = params.projectSlug ?? props.fallback?.project;
  const envSlug = params.projectSlug ? params.envSlug : props.fallback?.environment;
  const project = props.projects.find((item) => item.slug === projectSlug);
  const environment = project?.environments.find((item) => item.slug === envSlug);
  const envBase =
    project && environment ? environmentPath(orgSlug, project.slug, environment.slug) : null;

  useEffect(() => {
    if (params.projectSlug && params.envSlug && environment) {
      rememberEnvironment(orgSlug, params.projectSlug, params.envSlug);
    }
  }, [orgSlug, params.projectSlug, params.envSlug, environment]);

  const area = areaOf(pathname, orgSlug, envBase);
  const inUse =
    project && environment ? (props.inUse[`${project.slug}/${environment.slug}`] ?? []) : [];
  const visible = visibleProducts(inUse, props.preferences);
  const railProducts = PRODUCTS.filter(
    (product) =>
      visible.includes(product.key) || (area.kind === "product" && area.product === product),
  );

  const panelRef = useRef<HTMLDivElement>(null);
  const panelIndicator = useActiveIndicator(panelRef, pathname);

  return (
    <Navigate.Provider value={setPending}>
      <Sidebar collapsible="icon" variant="inset">
        <div className="flex h-full w-full">
          <ProductRail
            area={area}
            envBase={envBase}
            organization={props.organization}
            pathname={pathname}
            organizations={props.organizations}
            products={railProducts}
            user={props.user}
          />
          <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
            <SidebarHeader className="gap-3">
              <SidebarWordmark href={envBase ?? `/${orgSlug}`} />
            </SidebarHeader>
            <SidebarContent className="relative" ref={panelRef}>
              <ActiveIndicator {...panelIndicator} />
              <Panel
                area={area}
                envBase={envBase}
                orgSlug={orgSlug}
                pathname={pathname}
                preferences={props.preferences}
                settingsPaths={props.settingsPaths}
                visible={visible}
              />
            </SidebarContent>
          </div>
        </div>
        <SidebarRail />
      </Sidebar>
    </Navigate.Provider>
  );
}

/** Tells the sidebar which page one of its links is opening. */
const Navigate = createContext<(href: string) => void>(() => {});

function areaOf(pathname: string, orgSlug: string, envBase: string | null): Area {
  const settings = settingsHref(orgSlug);
  if (pathname === settings || pathname.startsWith(`${settings}/`)) return { kind: "organization" };
  if (!envBase || !pathname.startsWith(envBase)) return { kind: "home" };
  const rest = pathname.slice(envBase.length);
  if (rest === "/products") return { kind: "catalog" };
  const section = sectionOf(rest);
  if (section === DEVELOPERS) return { kind: "developers" };
  if (section && "key" in section) return { kind: "product", product: section };
  return { kind: "home" };
}

function ProductRail(props: {
  area: Area;
  pathname: string;
  envBase: string | null;
  organization: ShellOrganization & { role: string };
  organizations: ShellOrganization[];
  products: Product[];
  user: ShellUser;
}) {
  const { envBase, area } = props;
  const { pathname } = props;
  const railRef = useRef<HTMLDivElement>(null);
  const railIndicator = useActiveIndicator(railRef, pathname);
  return (
    <div
      className="relative flex w-(--sidebar-width-icon) shrink-0 flex-col items-center gap-2 py-2 max-md:w-14 max-md:border-e max-md:pt-3 group-data-[collapsible=icon]:py-0 border-sidebar-border md:border-e md:pe-px group-data-[collapsible=icon]:md:border-e-0"
      ref={railRef}
    >
      <ActiveIndicator {...railIndicator} />
      <OrganizationMenu current={props.organization} organizations={props.organizations} />
      <SidebarMenu className="items-center gap-1">
        {envBase ? (
          <>
            <RailLink active={area.kind === "home"} href={envBase} icon={HouseIcon} label="Home" />
            <RailLink
              active={area.kind === "catalog"}
              href={`${envBase}/products`}
              icon={LayoutGridIcon}
              label="All products"
            />
          </>
        ) : null}
      </SidebarMenu>
      {envBase && props.products.length > 0 ? (
        <>
          <div aria-hidden className="h-px w-6 bg-sidebar-border" />
          <SidebarMenu className="items-center gap-1">
            {props.products.map((product) => (
              <RailLink
                active={area.kind === "product" && area.product === product}
                href={envBase + product.path}
                icon={PRODUCT_ICONS[product.key]}
                key={product.key}
                label={product.name}
              />
            ))}
          </SidebarMenu>
        </>
      ) : null}
      <SidebarMenu className="mt-auto items-center gap-1">
        {envBase ? (
          <RailLink
            active={area.kind === "developers"}
            href={envBase + DEVELOPERS.path}
            icon={DEVELOPERS_ICON}
            label="Developers"
          />
        ) : null}
        <RailLink
          active={area.kind === "organization"}
          href={settingsHref(props.organization.slug)}
          icon={ORGANIZATION_ICON}
          label="Organization"
        />
        <RailLink icon={BookOpenIcon} label="Documentation" link={<a href="/docs" />} />
      </SidebarMenu>
      <UserNav compact user={props.user} />
    </div>
  );
}

function RailLink(
  props: { label: string; icon: LucideIcon; active?: boolean } & (
    | { href: string }
    /** Another zone of coss.com (the docs): a plain link. */
    | { link: ReactElement }
  ),
) {
  const { isMobile, setOpenMobile } = useSidebar();
  const navigate = useContext(Navigate);
  const Icon = props.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="size-8 justify-center p-0 data-[active=true]:bg-transparent"
        isActive={props.active}
        render={
          "link" in props ? (
            props.link
          ) : (
            <Link
              href={props.href}
              onNavigate={() => {
                setOpenMobile(false);
                navigate(props.href);
              }}
            />
          )
        }
        tooltip={{ children: props.label, hidden: isMobile }}
      >
        <Icon />
        <span className="sr-only">{props.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The organization's initials at the top of the rail, opening the organization menu. */
function OrganizationMenu(props: {
  current: ShellOrganization & { role: string };
  organizations: ShellOrganization[];
}) {
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu className="items-center">
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={
              <SidebarMenuButton
                className="size-8 justify-center p-0 data-popup-open:bg-sidebar-accent"
                tooltip={{ children: props.current.name, hidden: isMobile }}
              />
            }
          >
            <OrganizationAvatar logo={props.current.logo} name={props.current.name} />
            <span className="sr-only">{props.current.name}</span>
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-60" side={isMobile ? "bottom" : "right"}>
            <MenuGroup>
              <MenuGroupLabel>Organizations</MenuGroupLabel>
              {props.organizations.map((org) => (
                <MenuLinkItem key={org.slug} render={<Link href={`/${org.slug}`} />}>
                  <CheckIcon className={org.slug === props.current.slug ? "" : "invisible"} />
                  <OrganizationAvatar
                    className="size-5 rounded-md"
                    logo={org.logo}
                    name={org.name}
                  />
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  {org.slug === props.current.slug ? (
                    <span className="ms-3 text-muted-foreground text-xs capitalize">
                      {props.current.role}
                    </span>
                  ) : null}
                </MenuLinkItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
            <MenuLinkItem render={<Link href={settingsHref(props.current.slug)} />}>
              <ORGANIZATION_ICON />
              Organization settings
            </MenuLinkItem>
            <MenuLinkItem render={<Link href="/onboarding" />}>
              <PlusIcon />
              New organization
            </MenuLinkItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function Panel(props: {
  area: Area;
  envBase: string | null;
  orgSlug: string;
  pathname: string;
  visible: ProductKey[];
  preferences: ProductPreferences;
  settingsPaths: string[];
}) {
  const { area, envBase } = props;

  if (area.kind === "organization") {
    const base = settingsHref(props.orgSlug);
    const pages = ORGANIZATION_SETTINGS.filter((page) => props.settingsPaths.includes(page.path));
    const active = activeNavItem(props.pathname, base, pages);
    const groups = [...new Set(pages.map((page) => page.group))];
    return (
      <>
        <PanelTitle icon={ORGANIZATION_ICON} title="Organization" />
        {groups.map((group) => (
          <PageGroup
            active={active}
            base={base}
            key={group}
            label={group}
            pages={pages.filter((page) => page.group === group)}
          />
        ))}
      </>
    );
  }

  if (!envBase) return <PanelTitle icon={HouseIcon} title="Home" />;

  if (area.kind === "product" || area.kind === "developers") {
    const section: DashboardSection = area.kind === "product" ? area.product : DEVELOPERS;
    const active = activeNavItem(props.pathname, envBase, section.pages);
    const own = section.pages.filter((page) => !page.shared);
    const shared = section.pages.filter((page) => page.shared);
    return (
      <>
        <PanelTitle
          action={
            area.kind === "product" ? (
              <ProductActions
                orgSlug={props.orgSlug}
                preference={props.preferences[area.product.key]}
                product={area.product}
                visible={props.visible.includes(area.product.key)}
              />
            ) : null
          }
          icon={area.kind === "product" ? PRODUCT_ICONS[area.product.key] : DEVELOPERS_ICON}
          title={section.name}
        />
        <PageGroup active={active} base={envBase} pages={own} />
        {shared.length > 0 ? (
          <PageGroup active={active} base={envBase} label="Shared across projects" pages={shared} />
        ) : null}
      </>
    );
  }

  const homePages: DashboardPage[] = [
    { label: "Overview", path: "", exact: true },
    { label: "All products", path: "/products" },
  ];
  const yours = PRODUCTS.filter((product) => props.visible.includes(product.key));
  return (
    <>
      <PanelTitle icon={HouseIcon} title="Home" />
      <PageGroup
        active={activeNavItem(props.pathname, envBase, homePages)}
        base={envBase}
        pages={homePages}
      />
      {yours.length > 0 ? (
        <PanelGroup label="Your products">
          {yours.map((product) => (
            <PanelLink
              href={envBase + product.path}
              icon={PRODUCT_ICONS[product.key]}
              key={product.key}
              label={product.name}
            />
          ))}
        </PanelGroup>
      ) : null}
      <PanelGroup label="Platform">
        <PanelLink href={envBase + DEVELOPERS.path} icon={DEVELOPERS_ICON} label="Developers" />
        <PanelLink
          href={settingsHref(props.orgSlug)}
          icon={ORGANIZATION_ICON}
          label="Organization"
        />
      </PanelGroup>
    </>
  );
}

function PanelTitle(props: { icon: LucideIcon; title: string; action?: ReactNode }) {
  const Icon = props.icon;
  return (
    <div className="flex h-9 items-center gap-2 px-4 pt-1">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <h2 className="min-w-0 flex-1 truncate font-heading font-semibold text-base text-foreground">
        {props.title}
      </h2>
      {props.action}
    </div>
  );
}

function PanelGroup(props: { label?: string; children: ReactNode }) {
  return (
    <SidebarGroup className="py-1">
      {props.label ? <SidebarGroupLabel>{props.label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">{props.children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function PageGroup<T extends DashboardPage>(props: {
  label?: string;
  base: string;
  pages: readonly T[];
  active: T | undefined;
}) {
  return (
    <PanelGroup label={props.label}>
      {props.pages.map((page) => (
        <PanelLink
          active={page === props.active}
          href={props.base + page.path}
          key={page.path}
          label={page.label}
        />
      ))}
    </PanelGroup>
  );
}

function PanelLink(props: { href: string; label: string; icon?: LucideIcon; active?: boolean }) {
  const { setOpenMobile } = useSidebar();
  const navigate = useContext(Navigate);
  const Icon = props.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn("data-[active=true]:bg-transparent", !Icon && "ps-3")}
        isActive={props.active}
        render={
          <Link
            href={props.href}
            onNavigate={() => {
              setOpenMobile(false);
              navigate(props.href);
            }}
          />
        }
      >
        {Icon ? <Icon /> : null}
        <span>{props.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** Pin a product to the rail, hide it, or go back to showing it while the environment uses it. */
function ProductActions(props: {
  orgSlug: string;
  product: Product;
  preference: boolean | undefined;
  visible: boolean;
}) {
  const [, action, pending] = useActionToast(setProductPreferenceAction, {
    errors: "toast",
    success: (choice) =>
      choice === "pin"
        ? `${props.product.name} pinned`
        : choice === "hide"
          ? `${props.product.name} hidden`
          : `${props.product.name} shown while in use`,
  });
  const choose = (choice: "pin" | "hide" | "reset") => {
    const formData = new FormData();
    formData.set("orgSlug", props.orgSlug);
    formData.set("product", props.product.key);
    formData.set("choice", choice);
    startTransition(() => action(formData));
  };
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${props.product.name} options`}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-sidebar-accent"
        disabled={pending}
      >
        <EllipsisIcon className="size-4" />
      </MenuTrigger>
      <MenuPopup align="end" className="min-w-56">
        {props.preference === true ? (
          <MenuItem onClick={() => choose("reset")}>
            <PinOffIcon />
            Unpin
          </MenuItem>
        ) : props.visible ? (
          <MenuItem onClick={() => choose("hide")}>
            <PinOffIcon />
            Hide from sidebar
          </MenuItem>
        ) : (
          <MenuItem onClick={() => choose("pin")}>
            <PinIcon />
            Pin to sidebar
          </MenuItem>
        )}
        {props.preference === false ? (
          <MenuItem onClick={() => choose("reset")}>
            <RotateCcwIcon />
            Show while in use
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuLinkItem render={<a href={props.product.docs} />}>
          <BookOpenIcon />
          Documentation
        </MenuLinkItem>
      </MenuPopup>
    </Menu>
  );
}
