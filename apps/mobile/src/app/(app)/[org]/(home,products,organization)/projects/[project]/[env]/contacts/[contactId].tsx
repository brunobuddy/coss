import { Stack, useLocalSearchParams } from "expo-router";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import {
  ListRow,
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../../lib/format";
import { useContact } from "../../../../../../../../lib/queries-contacts";
import { CONTACT_STATUS } from "../../../../../../../../lib/status-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's contacts/[contactId]/page.tsx and contact-forms.tsx (read-only: the
// app shows the form's values, not its fields).
const CHOICE_LABELS = { opted_in: "Opted in", opted_out: "Opted out" } as const;

export default function ContactScreen() {
  const { contactId, ...params } = useLocalSearchParams<
    EnvironmentParams & { contactId: string }
  >();
  const query = useContact(params, contactId);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { contact, properties, topics, audiences } = query.data;
  const [tone, label] = CONTACT_STATUS[contact.status];
  const base = environmentPath(params);

  return (
    <>
      <WebButton path={`${base}/contacts/${contact.id}`} />
      <Screen onRefresh={() => query.refetch()} title={contact.email}>
        <PageIntro
          description={`Added ${formatDateTime(contact.created_at)} (${contact.source}).`}
          meta={
            <Badge variant="outline">
              <StatusDot label={label} tone={tone} />
            </Badge>
          }
          title={contact.email}
        />
        <Panel title="Details">
          <SpecList>
            <SpecItem label="First name">{contact.first_name || "—"}</SpecItem>
            <SpecItem label="Last name">{contact.last_name || "—"}</SpecItem>
            {properties.map((property) => (
              <SpecItem key={property.key} label={property.key} mono>
                {property.value === null ? "—" : String(property.value)}
              </SpecItem>
            ))}
          </SpecList>
          {contact.status === "pending" ? (
            <PanelBody>
              <Text muted variant="small">
                Waiting for the contact to confirm their subscription.
              </Text>
            </PanelBody>
          ) : null}
        </Panel>
        <Panel title="Consent">
          <SpecList>
            <SpecItem label="Subscribed" mono>
              {formatDateTime(contact.subscribed_at)}
            </SpecItem>
            <SpecItem label="Unsubscribed" mono>
              {formatDateTime(contact.unsubscribed_at)}
            </SpecItem>
            <SpecItem label="Confirmed (double opt-in)" mono>
              {formatDateTime(contact.confirmed_at)}
            </SpecItem>
            <SpecItem label="Id" mono>
              {contact.id}
            </SpecItem>
          </SpecList>
        </Panel>
        <Panel
          description={
            contact.status === "subscribed"
              ? "Emails about a topic reach the contact unless they opted out (opt-in topics) or unless they opted in (opt-out topics)."
              : "The contact isn't subscribed, so no topic's emails reach them."
          }
          title="Topics"
        >
          {topics.length > 0 ? (
            <Ruled>
              {topics.map((topic) => (
                <ListRow
                  detail={topic.topic}
                  key={topic.topic}
                  subtitle={`${topic.choice ? CHOICE_LABELS[topic.choice] : "Default"} · Receives: ${topic.subscribed ? "Yes" : "No"}`}
                  title={topic.name}
                />
              ))}
            </Ruled>
          ) : (
            <PanelBody>
              <Text muted variant="small">
                No topics yet.
              </Text>
            </PanelBody>
          )}
        </Panel>
        <Panel title="Audiences">
          {audiences.length > 0 ? (
            <Ruled>
              {audiences.map((audience) => (
                <ListRow
                  href={{
                    pathname: "/[org]/projects/[project]/[env]/audiences/[audienceId]",
                    params: { ...params, audienceId: audience.id },
                  }}
                  key={audience.id}
                  subtitle={`Member: ${audience.member ? "Yes" : "No"}`}
                  title={audience.name}
                />
              ))}
            </Ruled>
          ) : (
            <PanelBody>
              <Text muted variant="small">
                No audiences yet.
              </Text>
            </PanelBody>
          )}
        </Panel>
      </Screen>
    </>
  );
}
