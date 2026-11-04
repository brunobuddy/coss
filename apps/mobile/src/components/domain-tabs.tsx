import { RouteTabs } from "./route-tabs";

// The dashboard's domain tabs (`DOMAIN_NAV` in apps/web/src/lib/navigation.ts).
export function DomainTabs(props: { org: string; domainId: string; value: "overview" | "dmarc" }) {
  const params = { org: props.org, domainId: props.domainId };
  return (
    <RouteTabs
      items={[
        {
          value: "overview",
          label: "Overview",
          href: { pathname: "/[org]/domains/[domainId]", params },
        },
        {
          value: "dmarc",
          label: "DMARC",
          href: { pathname: "/[org]/domains/[domainId]/dmarc", params },
        },
      ]}
      value={props.value}
    />
  );
}
