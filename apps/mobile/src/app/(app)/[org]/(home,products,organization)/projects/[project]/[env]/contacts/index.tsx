import type { ContactStatus } from "@coss/companion";
import { router, useLocalSearchParams } from "expo-router";
import { Braces, ContactRound, SearchX } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../components/badge";
import { Button } from "../../../../../../../../components/button";
import { type Filter, FilterChips } from "../../../../../../../../components/filters";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { SearchField } from "../../../../../../../../components/search-field";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo, formatCount } from "../../../../../../../../lib/format";
import { useContacts } from "../../../../../../../../lib/queries-contacts";
import { CONTACT_STATUS } from "../../../../../../../../lib/status-contacts";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from the dashboard's contacts/page.tsx.
const FILTERS: Filter<ContactStatus>[] = [
  { value: null, label: "All" },
  { value: "subscribed", label: "Subscribed" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "pending", label: "Pending" },
];

export default function ContactsScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ContactStatus | null>(null);
  const query = useContacts(params, { email, status });
  const first = query.data?.pages[0];
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const filtered = Boolean(email || status);
  return (
    <Screen onRefresh={() => query.refetch()} title="Contacts">
      <WebButton path={`${environmentPath(params)}/contacts`} />
      <PageIntro
        description={`The people this environment's marketing email goes to, with their consent.${
          first ? ` ${formatCount(first.total)} ${first.total === 1 ? "contact" : "contacts"}.` : ""
        }`}
        meta={<ModeBadge params={params} />}
        title="Contacts"
      />
      <View style={styles.toolbar}>
        <Button
          icon={Braces}
          onPress={() =>
            router.push({ pathname: "/[org]/projects/[project]/[env]/contacts/properties", params })
          }
          size="sm"
          title="Properties"
          variant="outline"
        />
      </View>
      <SearchField
        keyboardType="email-address"
        onSubmit={setEmail}
        placeholder="Find an address"
        value={email}
      />
      <FilterChips items={FILTERS} onChange={setStatus} value={status} />
      <PagedPanel
        empty={
          first?.invalid_email
            ? {
                icon: SearchX,
                title: "Enter a valid email address",
                description: "Search for a full email address, like ada@example.com.",
              }
            : {
                icon: email ? SearchX : ContactRound,
                title: filtered ? "No contacts found" : "No contacts yet",
                description: filtered
                  ? "No contact matches."
                  : "Add contacts here, import a CSV, or upsert them with the API.",
              }
        }
        items={items}
        query={query}
        render={(contact) => {
          const [tone, label] = CONTACT_STATUS[contact.status];
          return (
            <ListRow
              detail={formatAgo(contact.created_at)}
              href={{
                pathname: "/[org]/projects/[project]/[env]/contacts/[contactId]",
                params: { ...params, contactId: contact.id },
              }}
              key={contact.id}
              subtitle={contact.name ?? "—"}
              title={contact.email}
              trailing={
                <Badge variant="outline">
                  <StatusDot label={label} tone={tone} />
                </Badge>
              }
            />
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row" },
});
