import { useLocalSearchParams } from "expo-router";
import { Braces } from "lucide-react-native";
import { EmptyState } from "../../../../../../../../components/empty";
import { ListRow, Panel, Ruled } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useContactProperties } from "../../../../../../../../lib/queries-contacts";
import { PROPERTY_TYPE_LABELS } from "../../../../../../../../lib/status-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's contacts/properties/page.tsx.
export default function ContactPropertiesScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useContactProperties(params);

  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const properties = query.data.data;

  return (
    <>
      <WebButton path={`${environmentPath(params)}/contacts/properties`} />
      <Screen onRefresh={() => query.refetch()} title="Contact properties">
        <PageIntro
          description="Typed custom fields of this environment's contacts (at most 50), usable in segments and as {{{contact.key}}} in broadcasts."
          title="Contact properties"
        />
        <Panel>
          {properties.length === 0 ? (
            <EmptyState
              description="Add a property, e.g. plan or signed_up_at, to store it on contacts."
              icon={Braces}
              title="No custom properties yet"
            />
          ) : (
            <Ruled>
              {properties.map((property) => (
                <ListRow
                  detail={formatAgo(property.created_at)}
                  key={property.id}
                  subtitle={`${PROPERTY_TYPE_LABELS[property.type]} · Fallback: ${
                    property.fallback === null ? "—" : String(property.fallback)
                  }`}
                  title={property.key}
                />
              ))}
            </Ruled>
          )}
        </Panel>
      </Screen>
    </>
  );
}
