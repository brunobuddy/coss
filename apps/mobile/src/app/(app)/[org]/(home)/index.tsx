import { Stack } from "expo-router";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { Screen } from "../../../../components/screen";
import { useActiveEnvironment } from "../../../../lib/active-environment";

export default function HomeScreen() {
  const { org } = useActiveEnvironment();
  return (
    <Screen>
      <Stack.Screen options={{ title: "Home", headerLargeTitle: true }} />
      <Panel title="Spike">
        <Ruled>
          <ListRow href={{ pathname: "/[org]/reputation", params: { org } }} title="Reputation" />
          <ListRow href={{ pathname: "/[org]/members", params: { org } }} title="Members" />
        </Ruled>
      </Panel>
    </Screen>
  );
}
