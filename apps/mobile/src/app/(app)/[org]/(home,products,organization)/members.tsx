import { useLocalSearchParams } from "expo-router";
import { MailPlus } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { UserAvatar } from "../../../../components/avatar";
import { Badge } from "../../../../components/badge";
import { EmptyState } from "../../../../components/empty";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { PageIntro, Screen } from "../../../../components/screen";
import { Text } from "../../../../components/text";
import { WebButton } from "../../../../components/web-button";
import { formatDate, formatDateTime, roleLabel } from "../../../../lib/format";
import { useMembers } from "../../../../lib/queries";

export default function MembersScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const query = useMembers(org);
  if (query.isPending) return <Screen loading="list" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { members, invitations, require_two_factor } = query.data;
  return (
    <Screen onRefresh={() => query.refetch()} title="Members">
      <WebButton path={`/${org}/members`} />
      <PageIntro
        description="People with access to this organization. Admins manage projects, domains and API keys; members can read everything but secrets."
        meta={
          <Text muted variant="mono">
            {members.length} {members.length === 1 ? "member" : "members"} · {invitations.length}{" "}
            invited
          </Text>
        }
        title="Members"
      />
      <Panel>
        <Ruled>
          {members.map((member) => (
            <View key={member.id} style={styles.member}>
              <UserAvatar name={member.name || member.email} size={36} />
              <View style={styles.memberText}>
                <Text numberOfLines={1} variant="label">
                  {member.name || member.email}
                  {member.you ? <Text muted> (you)</Text> : null}
                </Text>
                <Text muted numberOfLines={1} variant="small">
                  {member.email}
                </Text>
                <View style={styles.badges}>
                  <Badge variant="outline">{roleLabel(member.role)}</Badge>
                  {member.directory ? <Badge variant="info">directory</Badge> : null}
                  {member.two_factor_enabled ? (
                    <Badge variant="success">2FA</Badge>
                  ) : require_two_factor ? (
                    <Badge variant="warning">no 2FA</Badge>
                  ) : null}
                </View>
              </View>
              <Text muted variant="mono">
                {formatDate(member.joined_at)}
              </Text>
            </View>
          ))}
        </Ruled>
      </Panel>
      <Panel title="Invitations">
        {invitations.length === 0 ? (
          <EmptyState
            description="Pending invitations appear here until they're accepted or expire."
            icon={MailPlus}
            title="No pending invitations"
          />
        ) : (
          <Ruled>
            {invitations.map((invitation) => (
              <ListRow
                detail={roleLabel(invitation.role)}
                key={invitation.id}
                subtitle={`Expires ${formatDateTime(invitation.expires_at)}`}
                title={invitation.email}
              />
            ))}
          </Ruled>
        )}
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  member: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  memberText: { flex: 1, gap: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 6 },
});
