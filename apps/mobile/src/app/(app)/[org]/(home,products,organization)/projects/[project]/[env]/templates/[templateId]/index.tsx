import { router, useLocalSearchParams } from "expo-router";
import { ExternalLink, History } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, StatusDot } from "../../../../../../../../../components/badge";
import { Button } from "../../../../../../../../../components/button";
import { CodeBlock } from "../../../../../../../../../components/code-block";
import { ModeBadge } from "../../../../../../../../../components/mode-badge";
import {
  Panel,
  PanelBody,
  Ruled,
  SpecItem,
  SpecList,
} from "../../../../../../../../../components/panel";
import { PageIntro, Screen } from "../../../../../../../../../components/screen";
import {
  initialLocale,
  LocaleTabs,
  TemplatePreviewPanel,
  TemplateVariablesPanel,
} from "../../../../../../../../../components/template-preview";
import { Text } from "../../../../../../../../../components/text";
import { WebButton } from "../../../../../../../../../components/web-button";
import { useTemplate } from "../../../../../../../../../lib/queries-templates";
import { templateStatuses } from "../../../../../../../../../lib/status-templates";
import {
  type EnvironmentParams,
  environmentPath,
  openOnWeb,
} from "../../../../../../../../../lib/web";

// apps/web/src/app/[orgSlug]/projects/[projectSlug]/[envSlug]/templates/[templateId]/page.tsx and
// its TemplateEditor (template-editor.tsx), read-only: the draft's subject and text as written,
// its problems, variables, preview and sample values. Editing, publishing, test sends and the
// HTML stay on coss.com.
export default function TemplateScreen() {
  const { templateId, ...params } = useLocalSearchParams<
    EnvironmentParams & { templateId: string }
  >();
  const query = useTemplate(params, templateId);
  const [selected, setSelected] = useState<string | null>(null);

  if (query.isPending) return <Screen loading="detail" />;
  if (query.isError && !query.data) {
    return <Screen error={query.error} onRetry={() => query.refetch()} />;
  }
  const { template, draft } = query.data;
  const path = `${environmentPath(params)}/templates/${template.id}`;
  const locales = draft.contents.map((content) => content.locale);
  const locale =
    selected && locales.includes(selected)
      ? selected
      : initialLocale(locales, draft.default_locale);
  const content = draft.contents.find((candidate) => candidate.locale === locale) ?? null;

  return (
    <Screen onRefresh={() => query.refetch()} title={template.name}>
      <WebButton path={path} />
      <PageIntro
        description={template.description ?? undefined}
        meta={
          <>
            <ModeBadge params={params} />
            {templateStatuses(template).map((status) => (
              <StatusDot key={status.label} label={status.label} tone={status.tone} />
            ))}
            {template.alias ? (
              <Badge mono variant="secondary">
                {template.alias}
              </Badge>
            ) : null}
            <Text muted numberOfLines={1} selectable style={styles.id} variant="mono">
              {template.id}
            </Text>
          </>
        }
        title={template.name}
      />
      <View style={styles.actions}>
        <Button
          icon={History}
          onPress={() =>
            router.push({
              pathname: "/[org]/projects/[project]/[env]/templates/[templateId]/versions",
              params: { ...params, templateId: template.id },
            })
          }
          size="sm"
          title="Versions"
          variant="outline"
        />
      </View>
      <LocaleTabs
        defaultLocale={draft.default_locale}
        locales={locales}
        onChange={setSelected}
        value={locale}
      />
      <Panel description={`Revision ${draft.revision}`} title="Draft">
        {content ? (
          <SpecList>
            <SpecItem label="Subject" stacked>
              <Text selectable variant="mono">
                {content.subject_source || "—"}
              </Text>
            </SpecItem>
            <SpecItem label="Text" stacked>
              <Text selectable variant="mono">
                {content.text_source ?? "—"}
              </Text>
            </SpecItem>
            <SpecItem label="HTML" stacked>
              {content.has_html ? (
                <View style={styles.button}>
                  <Button
                    icon={ExternalLink}
                    onPress={() => openOnWeb(path)}
                    size="sm"
                    title="Open on coss.com"
                    variant="outline"
                  />
                </View>
              ) : (
                <Text variant="mono">—</Text>
              )}
            </SpecItem>
          </SpecList>
        ) : (
          <PanelBody>
            <Text muted variant="small">
              Add a locale to write the template.
            </Text>
          </PanelBody>
        )}
      </Panel>
      {draft.problems.length > 0 ? (
        <Panel
          description="These keep the draft from being published and from test sends."
          title="Problems"
        >
          <Ruled>
            {draft.problems.map((problem) => (
              <View
                key={`${problem.locale}:${problem.field}:${problem.line}:${problem.column}:${problem.message}`}
                style={styles.problem}
              >
                <Text muted variant="mono">
                  {`${problem.locale} · ${problem.field} · ${problem.line}:${problem.column}`}
                </Text>
                <Text selectable variant="small">
                  {problem.message}
                </Text>
              </View>
            ))}
          </Ruled>
        </Panel>
      ) : null}
      <TemplateVariablesPanel
        description="Sends must pass the required ones (unless they have a default). Unknown names are refused."
        empty="No variables yet."
        variables={draft.variables}
      />
      <TemplatePreviewPanel
        content={content}
        description="Rendered with the sample values, exactly as a send would be."
        sampleIssues={draft.sample_issues}
        webPath={path}
      />
      <Panel
        description="JSON, as you would pass `variables`. Used by the preview and test sends."
        title="Sample values"
      >
        <CodeBlock>{JSON.stringify(draft.sample_variables, null, 2)}</CodeBlock>
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  id: { flexShrink: 1 },
  actions: { flexDirection: "row", gap: 8 },
  button: { alignSelf: "flex-start" },
  problem: { gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
});
