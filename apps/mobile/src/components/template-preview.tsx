import type {
  MobileTemplateVariable,
  TemplatePreviewContent,
  TemplateRendering,
} from "@coss/companion";
import { ExternalLink } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { colors, space } from "../lib/theme";
import { openOnWeb } from "../lib/web";
import { Alert } from "./alert";
import { Button } from "./button";
import { Panel, PanelBody, SpecItem, SpecList } from "./panel";
import { Tabs } from "./tabs";
import { Text } from "./text";

// The template screens' shared parts: the dashboard's TemplatePreview
// (templates/template-preview.tsx) without the HTML, which stays on coss.com, and the variables
// as VersionView lists them (templates/[templateId]/versions/[version]/version-view.tsx).

/** The locales to switch between, the default one marked as in the dashboard's select. */
export function LocaleTabs(props: {
  locales: string[];
  defaultLocale: string;
  value: string;
  onChange: (locale: string) => void;
}) {
  if (props.locales.length === 0) return null;
  return (
    <Tabs
      items={props.locales.map((locale) => ({
        value: locale,
        label: locale === props.defaultLocale ? `${locale} (default)` : locale,
      }))}
      onChange={props.onChange}
      value={props.value}
    />
  );
}

/** The default locale when there is one, else the first. */
export function initialLocale(locales: string[], defaultLocale: string): string {
  return locales.includes(defaultLocale) ? defaultLocale : (locales[0] ?? "");
}

function Rendered(props: { rendering: TemplateRendering; mono?: boolean }) {
  if (!props.rendering.ok) {
    return (
      <Text selectable style={styles.error} variant="small">
        {props.rendering.message}
      </Text>
    );
  }
  return (
    <Text selectable variant={props.mono ? "mono" : "body"}>
      {props.rendering.value || "—"}
    </Text>
  );
}

/** One locale rendered with the sample values; "Preview on coss.com" for its HTML. */
export function TemplatePreviewPanel(props: {
  content: TemplatePreviewContent | null;
  sampleIssues: string[];
  /** The dashboard page that previews the HTML. */
  webPath: string;
  description?: string;
}) {
  const { content } = props;
  return (
    <Panel description={props.description} title="Preview">
      <PanelBody>
        {content === null ? (
          <Text muted variant="small">
            Add a locale to preview it.
          </Text>
        ) : (
          <>
            <View style={styles.field}>
              <Text muted variant="small">
                Subject
              </Text>
              <Rendered rendering={content.subject} />
            </View>
            {props.sampleIssues.length > 0 ? (
              <Alert
                description={props.sampleIssues.join("\n")}
                title="The sample values don't match the variables:"
                tone="warning"
              />
            ) : null}
            {content.text ? (
              <View style={styles.field}>
                <Text muted variant="small">
                  Text
                </Text>
                <Rendered rendering={content.text} />
              </View>
            ) : null}
            {content.has_html ? (
              <View style={styles.field}>
                <Text muted variant="small">
                  HTML
                </Text>
                <Text muted variant="small">
                  The HTML preview stays on coss.com, where it is sandboxed.
                </Text>
                <View style={styles.button}>
                  <Button
                    icon={ExternalLink}
                    onPress={() => openOnWeb(props.webPath)}
                    size="sm"
                    title="Preview on coss.com"
                    variant="outline"
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

// version-view.tsx: `type`, a list's item fields, "(optional)", "= default".
function describeVariable(variable: MobileTemplateVariable): string {
  return `${variable.type}${
    variable.type === "list"
      ? ` of { ${variable.fields.map((field) => `${field.name}: ${field.type}`).join(", ")} }`
      : ""
  }${variable.required ? "" : " (optional)"}${
    variable.default === null ? "" : ` = ${JSON.stringify(variable.default)}`
  }`;
}

export function TemplateVariablesPanel(props: {
  variables: MobileTemplateVariable[];
  description?: string;
  /** Shown instead of the list when there are none. */
  empty: string;
}) {
  return (
    <Panel description={props.description} title="Variables">
      {props.variables.length === 0 ? (
        <PanelBody>
          <Text muted variant="small">
            {props.empty}
          </Text>
        </PanelBody>
      ) : (
        <SpecList>
          {props.variables.map((variable) => (
            <SpecItem key={variable.name} label={variable.name} stacked>
              <Text selectable variant="mono">
                {describeVariable(variable)}
              </Text>
              {variable.description ? (
                <Text muted variant="small">
                  {variable.description}
                </Text>
              ) : null}
            </SpecItem>
          ))}
        </SpecList>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  button: { alignSelf: "flex-start", marginTop: space.xs },
  error: { color: colors.destructiveForeground },
});
