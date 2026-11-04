import { Stack, useLocalSearchParams } from "expo-router";
import { History } from "lucide-react-native";
import { Badge } from "../../../../../../../../../../components/badge";
import { PagedPanel } from "../../../../../../../../../../components/paged";
import { ListRow } from "../../../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../../../components/screen";
import { WebButton } from "../../../../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../../../../lib/format";
import { useTemplateVersions } from "../../../../../../../../../../lib/queries-templates";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../../lib/web";

// Copy from apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/templates/[templateId]/versions/page.tsx.
// The table's columns (version, locales, variables, published) become a row.
export default function TemplateVersionsScreen() {
  const { templateId, ...params } = useLocalSearchParams<
    EnvironmentParams & { templateId: string }
  >();
  const query = useTemplateVersions(params, templateId);
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const template = query.data?.pages[0]?.template;
  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const title = template ? `${template.name}: versions` : "Versions";
  return (
    <Screen onRefresh={() => query.refetch()} title={title}>
      <WebButton path={`${environmentPath(params)}/templates/${templateId}/versions`} />
      <PageIntro
        description="Every published version, which never changes. Restore one into the draft to publish it again."
        title={title}
      />
      <PagedPanel
        empty={{
          icon: History,
          title: "Not published yet",
          description: "Publish the draft to create version 1.",
        }}
        items={items}
        query={query}
        render={(version) => (
          <ListRow
            detail={formatDateTime(version.published_at)}
            href={{
              pathname: "/[org]/projects/[project]/[env]/templates/[templateId]/versions/[version]",
              params: { ...params, templateId, version: String(version.version) },
            }}
            key={version.version}
            subtitle={`${version.locales.join(", ")} · ${version.variables.join(", ") || "—"}`}
            title={`Version ${version.version}`}
            trailing={
              version.version === template?.published_version ? (
                <Badge variant="success">Current</Badge>
              ) : undefined
            }
          />
        )}
      />
    </Screen>
  );
}
