import { Redirect, router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { OrganizationList } from "../../components/organization-list";
import { PageIntro, Screen } from "../../components/screen";
import { Text } from "../../components/text";
import { lastOrganization } from "../../lib/last-org";
import { useMe } from "../../lib/queries";

/** Opens the only organization or the last one used before anything is drawn; else the list. */
export default function OrganizationsScreen() {
  const me = useMe();
  const [last, setLast] = useState<string | null | undefined>();
  useEffect(() => {
    void lastOrganization().then(setLast);
  }, []);
  const organizations = me.data?.organizations;
  const opened = organizations
    ? organizations.length === 1
      ? organizations[0]?.slug
      : organizations.find((org) => org.slug === last)?.slug
    : undefined;
  if (last === undefined || (me.isPending && last)) return null;
  if (opened) return <Redirect href={{ pathname: "/[org]", params: { org: opened } }} />;
  return (
    <Screen
      error={me.isError && !me.data ? me.error : null}
      loading={me.isPending ? "list" : undefined}
      onRefresh={() => me.refetch()}
      onRetry={() => me.refetch()}
      title="Organizations"
    >
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Account"
          icon="person.crop.circle"
          onPress={() => router.push("/settings")}
        />
      </Stack.Toolbar>
      <PageIntro
        description="Every organization you're a member of. Pick one to see its projects, email activity and sending reputation."
        meta={
          me.data ? (
            <Text muted variant="mono">
              {me.data.user.email}
            </Text>
          ) : null
        }
      />
      {organizations ? (
        <OrganizationList
          onSelect={(org) => router.replace({ pathname: "/[org]", params: { org } })}
          organizations={organizations}
        />
      ) : null}
    </Screen>
  );
}
