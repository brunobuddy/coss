import { router, Stack } from "expo-router";
import { OrganizationList } from "../../components/organization-list";
import { Screen } from "../../components/screen";
import { useMe } from "../../lib/queries";

/** Switching from inside an organization: a sheet over the tabs. */
export default function OrganizationsSheet() {
  const me = useMe();
  return (
    <Screen
      error={me.isError && !me.data ? me.error : null}
      loading={me.isPending ? "list" : undefined}
      onRefresh={() => me.refetch()}
      onRetry={() => me.refetch()}
    >
      <Stack.Screen options={{ title: "Organizations" }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={() => router.back()}>Done</Stack.Toolbar.Button>
      </Stack.Toolbar>
      {me.data ? (
        <OrganizationList
          organizations={me.data.organizations}
          onSelect={(org) => {
            router.dismissTo({ pathname: "/[org]", params: { org } });
          }}
        />
      ) : null}
    </Screen>
  );
}
