import { Link, router, Stack, useNavigation } from "expo-router";
import { Building2 } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable } from "react-native";
import { OrgAvatar, UserAvatar } from "../../components/avatar";
import { EmptyState } from "../../components/empty";
import { ListRow, Panel, Ruled } from "../../components/panel";
import { PageIntro, Screen } from "../../components/screen";
import { Text } from "../../components/text";
import { roleLabel } from "../../lib/format";
import { lastOrganization } from "../../lib/last-org";
import { useMe } from "../../lib/queries";

export default function OrganizationsScreen() {
  const me = useMe();
  const organizations = me.data?.organizations;
  const navigation = useNavigation();
  // Once per sign-in, open the only organization or the last one used; going back keeps this
  // list reachable. Not over a page a notification or link already opened.
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!organizations || autoOpened.current) return;
    autoOpened.current = true;
    if (!navigation.isFocused()) return;
    void (async () => {
      const last = organizations.length === 1 ? organizations[0]?.slug : await lastOrganization();
      if (!navigation.isFocused()) return;
      if (last && organizations.some((org) => org.slug === last)) {
        router.push({ pathname: "/[org]", params: { org: last } });
      }
    })();
  }, [organizations, navigation]);
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            me.data ? (
              <Link asChild href="/settings">
                <Pressable accessibilityLabel="Account" hitSlop={8}>
                  <UserAvatar name={me.data.user.name} size={30} />
                </Pressable>
              </Link>
            ) : null,
        }}
      />
      {me.isPending ? (
        <Screen loading="list" />
      ) : me.isError && !me.data ? (
        <Screen error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <Screen onRefresh={() => me.refetch()} title="Organizations">
          <PageIntro
            title="Organizations"
            description="Every organization you're a member of. Pick one to see its projects, email activity and sending reputation."
            meta={
              <Text muted variant="mono">
                {me.data.user.email}
              </Text>
            }
          />
          {me.data.organizations.length === 0 ? (
            <Panel>
              <EmptyState
                description="Create an organization on coss.com, then pull to refresh."
                icon={Building2}
                title="No organizations yet"
              />
            </Panel>
          ) : (
            <Panel>
              <Ruled>
                {me.data.organizations.map((org) => (
                  <ListRow
                    detail={org.slug}
                    href={{ pathname: "/[org]", params: { org: org.slug } }}
                    key={org.slug}
                    leading={<OrgAvatar name={org.name} />}
                    subtitle={roleLabel(org.role)}
                    title={org.name}
                  />
                ))}
              </Ruled>
            </Panel>
          )}
        </Screen>
      )}
    </>
  );
}
