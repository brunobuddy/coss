import { RouteTabs } from "./route-tabs";

// The dashboard's spend tabs (`SPEND_NAV` in apps/web/src/lib/navigation.ts).
export function SpendTabs(props: { org: string; value: "overview" | "budgets" }) {
  const params = { org: props.org };
  return (
    <RouteTabs
      items={[
        {
          value: "overview",
          label: "Overview",
          href: { pathname: "/[org]/spend", params },
        },
        {
          value: "budgets",
          label: "Budgets",
          href: { pathname: "/[org]/spend/budgets", params },
        },
      ]}
      value={props.value}
    />
  );
}
