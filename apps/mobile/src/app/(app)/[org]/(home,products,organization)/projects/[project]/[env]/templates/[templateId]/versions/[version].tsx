import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Badge } from "../../../../../../../../../../components/badge";
import {
  ErrorState,
  Loading,
  PageIntro,
  Screen,
} from "../../../../../../../../../../components/screen";
import {
  initialLocale,
  LocaleTabs,
  TemplatePreviewPanel,
  TemplateVariablesPanel,
} from "../../../../../../../../../../components/template-preview";
import { Text } from "../../../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../../../components/web-button";
import { formatDateTime } from "../../../../../../../../../../lib/format";
import { useTemplateVersion } from "../../../../../../../../../../lib/queries-templates";
import { type EnvironmentParams, environmentPath } from "../../../../../../../../../../lib/web";

// apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/templates/[templateId]/versions/[version]/page.tsx
// and its VersionView (version-view.tsx), without "Restore to draft" (on coss.com).
export default function TemplateVersionScreen() {
  const {
    templateId,
    version: versionParam,
    ...params
  } = useLocalSearchParams<EnvironmentParams & { templateId: string; version: string }>();
  const query = useTemplateVersion(params, templateId, versionParam);
  const [selected, setSelected] = useState<string | null>(null);

  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const { template, version } = query.data;
  const path = `${environmentPath(params)}/templates/${template.id}/versions/${version.version}`;
  const locales = version.contents.map((content) => content.locale);
  const locale =
    selected && locales.includes(selected)
      ? selected
      : initialLocale(locales, version.default_locale);
  const content = version.contents.find((candidate) => candidate.locale === locale) ?? null;
  const title = `${template.name}: version ${version.version}`;

  return (
    <Screen onRefresh={() => query.refetch()} title={title}>
      <Stack.Screen options={{ headerRight: () => <WebButton path={path} /> }} />
      <PageIntro
        meta={
          <>
            {version.version === template.published_version ? (
              <Badge variant="success">Current</Badge>
            ) : null}
            <Text muted variant="small">
              {`Published ${formatDateTime(version.published_at)}`}
            </Text>
          </>
        }
        title={title}
      />
      <LocaleTabs
        defaultLocale={version.default_locale}
        locales={locales}
        onChange={setSelected}
        value={locale}
      />
      <TemplatePreviewPanel content={content} sampleIssues={version.sample_issues} webPath={path} />
      <TemplateVariablesPanel empty="None" variables={version.variables} />
    </Screen>
  );
}
