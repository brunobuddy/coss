import type { MeResponse } from "@coss/companion";
import { Building2 } from "lucide-react-native";
import { roleLabel } from "../lib/format";
import { OrgAvatar } from "./avatar";
import { EmptyState } from "./empty";
import { ListRow, Panel, Ruled } from "./panel";

export function OrganizationList(props: {
  organizations: MeResponse["organizations"];
  onSelect: (slug: string) => void;
}) {
  if (props.organizations.length === 0) {
    return (
      <Panel>
        <EmptyState
          description="Create an organization on coss.com, then pull to refresh."
          icon={Building2}
          title="No organizations yet"
        />
      </Panel>
    );
  }
  return (
    <Panel>
      <Ruled>
        {props.organizations.map((org) => (
          <ListRow
            detail={org.slug}
            key={org.slug}
            leading={<OrgAvatar name={org.name} />}
            onPress={() => props.onSelect(org.slug)}
            subtitle={roleLabel(org.role)}
            title={org.name}
          />
        ))}
      </Ruled>
    </Panel>
  );
}
