import { Stack, useLocalSearchParams } from "expo-router";
import { LayoutTemplate } from "lucide-react-native";
import { StatusDot } from "../../../../../../../../components/badge";
import { ModeBadge } from "../../../../../../../../components/mode-badge";
import { PagedPanel } from "../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../components/web-button";
import { formatAgo } from "../../../../../../../../lib/format";
import { useTemplates } from "../../../../../../../../lib/queries-templates";
import { templateStatuses, templateTone } from "../../../../../../../../lib/status-templates";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/templates/page.tsx. The
// table's columns (template, alias, status, updated) become a row: name and time, then alias and
// status (the dot warns of unpublished changes).
export default function TemplatesScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  const query = useTemplates(params);
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const path = `${environmentPath(params)}/templates`;
  return (
    <Screen onRefresh={() => query.refetch()} title="Templates">
      <Stack.Screen options={{ headerRight: () => <WebButton path={path} /> }} />
      <PageIntro
        description="Subjects and bodies with typed variables, in every language you send. Edit a draft, publish it, then send it by id or alias."
        meta={<ModeBadge params={params} />}
        title="Templates"
      />
      <PagedPanel
        empty={{
          icon: LayoutTemplate,
          title: "No templates yet",
          description:
            "Keep your emails' copy out of your code: send `template_id` and `variables` instead of `subject` and `html`.",
        }}
        items={items}
        olderLabel="Older templates"
        query={query}
        render={(template) => (
          <ListRow
            detail={formatAgo(template.updated_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/templates/[templateId]",
              params: { ...params, templateId: template.id },
            }}
            key={template.id}
            leading={<StatusDot tone={templateTone(template)} />}
            subtitle={[template.alias, ...templateStatuses(template).map((status) => status.label)]
              .filter(Boolean)
              .join(" · ")}
            title={template.name}
          />
        )}
      />
    </Screen>
  );
}
