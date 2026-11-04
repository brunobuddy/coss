import type { Verdict } from "@coss/companion";
import { Stack, useLocalSearchParams } from "expo-router";
import { FileText, Paperclip } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Alert } from "../../../../../../../../components/alert";
import { Badge } from "../../../../../../../../components/badge";
import { CodeBlock } from "../../../../../../../../components/code-block";
import { EmptyState } from "../../../../../../../../components/empty";
import { Icon } from "../../../../../../../../components/icon";
import {
  ListRow,
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { Tabs } from "../../../../../../../../components/tabs";
import { Text } from "../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatBytes, formatDateTime } from "../../../../../../../../lib/format";
import { useReceivedEmail } from "../../../../../../../../lib/queries";
import type { Tone } from "../../../../../../../../lib/theme";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

type Tab = "overview" | "text" | "headers" | "attachments";

const VERDICT_TONE: Record<string, Tone | "secondary"> = {
  pass: "success",
  fail: "error",
  gray: "warning",
  processing_failed: "secondary",
};

function VerdictBadge({ label, verdict }: { label: string; verdict: Verdict }) {
  return (
    <Badge variant={verdict ? VERDICT_TONE[verdict] : "outline"}>
      {`${label}: ${verdict ? verdict.replaceAll("_", " ") : "not checked"}`}
    </Badge>
  );
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

export default function ReceivedEmailScreen() {
  const { id, ...params } = useLocalSearchParams<EnvironmentParams & { id: string }>();
  const query = useReceivedEmail(params, id);
  const [tab, setTab] = useState<Tab>("overview");
  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const email = query.data;
  const path = `${environmentPath(params)}/received/${email.id}`;
  return (
    <Screen onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: "Received" }} />
      <WebButton path={path} />
      <PageIntro
        meta={
          <>
            <Badge variant={email.status === "blocked" ? "error" : "success"}>{email.status}</Badge>
            {email.spam ? <Badge variant="warning">spam</Badge> : null}
            <Text muted numberOfLines={1} selectable style={styles.id} variant="mono">
              {email.id}
            </Text>
          </>
        }
        title={email.subject || "(no subject)"}
      />
      {email.status === "blocked" ? (
        <Alert
          description="This message carried a virus, so its content was never stored or announced by webhook."
          tone="error"
        />
      ) : null}
      {email.truncated ? (
        <Alert
          description="Some of this email's headers or bodies were too long to show in full; download the .eml on coss.com for all of it."
          tone="warning"
        />
      ) : null}
      <Tabs
        items={[
          { value: "overview", label: "Overview" },
          { value: "text", label: "Content" },
          { value: "headers", label: "Headers", count: email.headers.length },
          ...(email.attachments.length > 0
            ? [
                {
                  value: "attachments" as const,
                  label: "Attachments",
                  count: email.attachments.length,
                },
              ]
            : []),
        ]}
        onChange={setTab}
        value={tab}
      />
      {tab === "overview" ? (
        <>
          <Panel title="Envelope">
            <SpecList>
              <SpecItem label="From">{email.from ?? "—"}</SpecItem>
              <SpecItem label="To">{list(email.to)}</SpecItem>
              {email.cc.length > 0 ? <SpecItem label="Cc">{list(email.cc)}</SpecItem> : null}
              {email.reply_to.length > 0 ? (
                <SpecItem label="Reply to">{list(email.reply_to)}</SpecItem>
              ) : null}
              <SpecItem label="Mail from" mono>
                {email.mail_from || "—"}
              </SpecItem>
              <SpecItem label="Received for">{list(email.recipients)}</SpecItem>
              <SpecItem label="Received" mono>
                {formatDateTime(email.received_at)}
              </SpecItem>
              <SpecItem label="Date header" mono>
                {formatDateTime(email.sent_at)}
              </SpecItem>
              <SpecItem label="Size" mono>
                {formatBytes(email.size)}
              </SpecItem>
              <SpecItem label="Message ID" mono stacked>
                {email.message_id ?? "—"}
              </SpecItem>
            </SpecList>
          </Panel>
          <Panel title="Verdicts">
            <PanelBody>
              <View style={styles.verdicts}>
                <VerdictBadge label="spam" verdict={email.verdicts.spam} />
                <VerdictBadge label="virus" verdict={email.verdicts.virus} />
                <VerdictBadge label="SPF" verdict={email.verdicts.spf} />
                <VerdictBadge label="DKIM" verdict={email.verdicts.dkim} />
                <VerdictBadge label="DMARC" verdict={email.verdicts.dmarc} />
              </View>
              {email.verdicts.dmarc_policy ? (
                <Text muted variant="mono">
                  DMARC policy: {email.verdicts.dmarc_policy}
                </Text>
              ) : null}
            </PanelBody>
          </Panel>
        </>
      ) : null}
      {tab === "text" ? (
        email.text !== null ? (
          <Panel title="Text">
            <PanelBody>
              <Text selectable variant="body">
                {email.text}
              </Text>
            </PanelBody>
          </Panel>
        ) : (
          <Panel>
            <EmptyState
              tone="email"
              description={
                email.has_html
                  ? "This email has an HTML body only. Its preview stays on coss.com, where it is sandboxed."
                  : email.status === "blocked"
                    ? "Blocked messages are never stored."
                    : "This email has no body."
              }
              icon={FileText}
              title={email.has_html ? "HTML only" : "No content"}
            />
          </Panel>
        )
      ) : null}
      {tab === "headers" ? (
        <Panel>
          <CodeBlock>
            {email.headers.map((header) => `${header.name}: ${header.value}`).join("\n")}
          </CodeBlock>
        </Panel>
      ) : null}
      {tab === "attachments" ? (
        <Panel footer="Download attachments on coss.com.">
          <Ruled>
            {email.attachments.map((attachment) => (
              <ListRow
                detail={formatBytes(attachment.size)}
                key={attachment.id}
                leading={<Icon color="mutedForeground" icon={Paperclip} />}
                subtitle={`${attachment.content_type}${attachment.disposition === "inline" ? " · inline" : ""}`}
                title={attachment.filename ?? "(unnamed)"}
              />
            ))}
          </Ruled>
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { flexShrink: 1 },
  verdicts: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
