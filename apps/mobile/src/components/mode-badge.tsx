import { useEnvironment } from "../lib/queries";
import type { EnvironmentParams } from "../lib/web";
import { Badge, StatusDot } from "./badge";

/** The dashboard's ModeBadge for the environment in the URL. */
export function ModeBadge({
  params,
  sandboxOnly,
}: {
  params: EnvironmentParams;
  /** Live is what people assume: only say so when it's a sandbox. */
  sandboxOnly?: boolean;
}) {
  const mode = useEnvironment(params).data?.environment.mode;
  if (!mode || (sandboxOnly && mode === "live")) return null;
  return (
    <Badge variant="outline">
      <StatusDot
        label={mode === "live" ? "Live" : "Sandbox"}
        tone={mode === "live" ? "success" : "info"}
      />
    </Badge>
  );
}
