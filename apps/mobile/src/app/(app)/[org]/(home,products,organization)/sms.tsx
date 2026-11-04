import type { MobileSmsCountry } from "@coss/companion";
import { useLocalSearchParams } from "expo-router";
import { Check, Globe, MessageSquare, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../components/alert";
import { StatusDot } from "../../../../components/badge";
import { Button } from "../../../../components/button";
import { EmptyState } from "../../../../components/empty";
import { Icon } from "../../../../components/icon";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { PageIntro, Screen } from "../../../../components/screen";
import { SearchField } from "../../../../components/search-field";
import { Segmented } from "../../../../components/tabs";
import { Code, Text } from "../../../../components/text";
import { WebButton } from "../../../../components/web-button";
import { formatDateTime } from "../../../../lib/format";
import { useSmsSenders } from "../../../../lib/queries-sms-senders";
import { SMS_NUMBER_SENDING, SMS_REGISTRATION_KIND } from "../../../../lib/status-sms-senders";
import { openOnWeb } from "../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/sms/page.tsx (and its sms-forms.tsx's countries filter).
// Read-only: buying numbers, registering senders, replies and countries are changed on coss.com.

type CountryView = "allowed" | "all";

function Countries(props: { countries: MobileSmsCountry[] }) {
  const [view, setView] = useState<CountryView>("allowed");
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const allowed = props.countries.filter((country) => country.allowed);
  const shown = (view === "allowed" ? allowed : props.countries).filter(
    (country) => !needle || country.name.toLowerCase().includes(needle),
  );
  return (
    <>
      <Segmented
        items={[
          { value: "allowed", label: `Allowed (${allowed.length})` },
          { value: "all", label: "All countries" },
        ]}
        onChange={setView}
        value={view}
      />
      <SearchField onSubmit={setFilter} placeholder="Filter countries" value={filter} />
      <Panel
        description="Where live messages may go, with the price per segment. Allowing only the countries your customers are in protects you from SMS pumping fraud."
        title="Countries"
      >
        {shown.length === 0 ? (
          <EmptyState
            description={needle ? "No country matches the filter." : "No country is allowed."}
            icon={Globe}
            title="No countries"
          />
        ) : (
          <Ruled>
            {shown.map((country) => (
              <View key={country.code} style={styles.country}>
                <View style={styles.check}>
                  {country.allowed ? <Icon icon={Check} size={16} /> : null}
                </View>
                <Text muted={!country.allowed} style={styles.fill} variant="small">
                  {country.name}
                  {country.locked ? (
                    <Text muted variant="small">
                      {" "}
                      (contact support)
                    </Text>
                  ) : null}
                </Text>
                <Text muted variant="mono">
                  {country.price}
                </Text>
              </View>
            ))}
          </Ruled>
        )}
      </Panel>
    </>
  );
}

export default function OrganizationSmsScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useSmsSenders(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { notice, can_create, numbers, registrations, countries } = query.data;
  const path = `/${org}/sms`;

  return (
    <Screen onRefresh={() => query.refetch()} title="SMS">
      <WebButton path={path} />
      <PageIntro
        description="Your organization's phone numbers, their carrier registrations and the countries live messages may go to. Sandbox environments need none of this: their messages are simulated."
        title="SMS"
      />
      {can_create ? (
        <View style={styles.actions}>
          <Button
            onPress={() => openOnWeb(`${path}/register`)}
            size="sm"
            title="Register a sender"
            variant="outline"
          />
        </View>
      ) : null}
      {notice === "unavailable" ? (
        <Alert
          description="Sandbox environments already send simulated messages. Contact support to get started with live SMS."
          title="SMS senders aren't available yet"
          tone="neutral"
        />
      ) : notice === "register_10dlc" ? (
        <Alert
          description="US carriers block A2P traffic from unregistered 10DLC numbers. Registration takes a few days; your numbers start sending once it is approved."
          title="Register your business to send from local numbers"
          tone="warning"
        />
      ) : null}

      <Panel
        description={
          <>
            Live sends go <Code>from</Code> one of these, once its registration is approved.
          </>
        }
        title="Numbers"
      >
        {numbers.length === 0 ? (
          <EmptyState
            description="Local numbers (registered for US A2P 10DLC) and toll-free ones (verified on their own) show up here."
            icon={MessageSquare}
            title="No numbers yet"
          />
        ) : (
          <Ruled>
            {numbers.map((number) => {
              const [tone, label] = SMS_NUMBER_SENDING[number.sending];
              return (
                <ListRow
                  key={number.id}
                  subtitle={`${number.kind === "toll_free" ? "Toll-free" : "Local"} · ${number.replies_to ? `Replies go to ${number.replies_to}` : "Replies are dropped"}`}
                  title={number.phone_number}
                  trailing={<StatusDot label={label} tone={tone} />}
                />
              );
            })}
          </Ruled>
        )}
      </Panel>

      <Panel
        description="Carriers review the business behind every sender. coss.com submits your details to Twilio and follows the review; brand and campaign fees are passed through at cost."
        title="Registrations"
      >
        {registrations.length === 0 ? (
          <EmptyState
            description="Register your business for US A2P 10DLC, or verify a toll-free number."
            icon={ShieldCheck}
            title="Nothing registered yet"
          />
        ) : (
          <Ruled>
            {registrations.map((registration) => {
              const [tone, label] = SMS_NUMBER_SENDING[registration.status];
              return (
                <View key={registration.id}>
                  <ListRow
                    detail={
                      registration.submitted_at
                        ? formatDateTime(registration.submitted_at)
                        : undefined
                    }
                    subtitle={registration.business}
                    title={SMS_REGISTRATION_KIND[registration.kind]}
                    trailing={<StatusDot label={label} tone={tone} />}
                  />
                  {registration.rejection_reason ? (
                    <Text muted style={styles.reason} variant="small">
                      {registration.rejection_reason}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </Ruled>
        )}
      </Panel>

      <Countries countries={countries} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: 8 },
  country: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  check: { width: 16 },
  fill: { flex: 1 },
  reason: { paddingHorizontal: 16, paddingBottom: 12, marginTop: -6 },
});
