import { Stack, useLocalSearchParams } from "expo-router";
import { Globe } from "lucide-react-native";
import { Alert } from "../../../../../components/alert";
import { StatusDot } from "../../../../../components/badge";
import { EmptyState } from "../../../../../components/empty";
import { ListRow, Panel, Ruled } from "../../../../../components/panel";
import { ErrorState, Loading, PageIntro, Screen } from "../../../../../components/screen";
import { WebButton } from "../../../../../components/web-button";
import { formatAgo } from "../../../../../lib/format";
import { useDomains } from "../../../../../lib/queries";
import { DOMAIN_STATUS } from "../../../../../lib/status";

export default function DomainsScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useDomains(org);
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  return (
    <Screen onRefresh={() => query.refetch()} title="Domains">
      <Stack.Screen options={{ headerRight: () => <WebButton path={`/${org}/domains`} /> }} />
      <PageIntro
        description="Live API keys can send from verified domains of this organization, in every project."
        title="Domains"
      />
      {query.data.sending_paused ? (
        <Alert
          description="Amazon SES paused this organization's sending. Contact support to resume it."
          title="Sending is paused"
          tone="error"
        />
      ) : null}
      <Panel>
        {query.data.data.length === 0 ? (
          <EmptyState
            description="Add one to send from your own address with live API keys."
            icon={Globe}
            title="No domains yet"
          />
        ) : (
          <Ruled>
            {query.data.data.map((domain) => {
              const [tone, label] = DOMAIN_STATUS[domain.status] ?? ["neutral", domain.status];
              return (
                <ListRow
                  detail={domain.last_checked_at ? formatAgo(domain.last_checked_at) : undefined}
                  href={{
                    pathname: "/[org]/domains/[domainId]",
                    params: { org, domainId: domain.id },
                  }}
                  key={domain.id}
                  leading={<StatusDot tone={tone} />}
                  subtitle={label}
                  title={domain.name}
                />
              );
            })}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}
