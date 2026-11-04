import { Stack, useLocalSearchParams } from "expo-router";
import { Boxes } from "lucide-react-native";
import { useState } from "react";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { SearchField } from "../../../../../../../../components/search-field";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useHookApplications } from "../../../../../../../../lib/queries";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

export default function HookApplicationsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [q, setQ] = useState("");
  const query = useHookApplications(params, q);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <Screen onRefresh={() => query.refetch()} title="Hooks">
      <Stack.Screen
        options={{ headerRight: () => <WebButton path={`${environmentPath(params)}/hooks`} /> }}
      />
      <PageIntro
        description="Send a message to one of your applications once: coss.com delivers it, signed and retried, to every endpoint its users registered."
        meta={<ModeBadge params={params} />}
        title="Hooks"
      />
      <SearchField onSubmit={setQ} placeholder="Find by uid, name or id" value={q} />
      <PagedPanel
        empty={
          q
            ? { icon: Boxes, title: "Nothing found", description: "No application matches." }
            : {
                icon: Boxes,
                title: "No applications yet",
                description:
                  "Create one per customer (or user) who receives your messages, through the API or here.",
              }
        }
        items={items}
        olderLabel="Older applications"
        query={query}
        render={(application) => (
          <ListRow
            detail={formatAgo(application.created_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/hooks/[applicationId]",
              params: { ...params, applicationId: application.id },
            }}
            key={application.id}
            subtitle={application.uid ?? application.id}
            title={application.name}
          />
        )}
        title="Applications"
      />
    </Screen>
  );
}
