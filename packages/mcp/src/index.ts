// The diagnosis lives in the SDK now (`coss/diagnose`); re-exported for existing imports.
export {
  type Diagnosis,
  type DiagnosisContext,
  diagnoseEmail,
  diagnoseSms,
  type RecipientDiagnosis,
  type RecipientOutcome,
  type SmsDiagnosis,
  type SmsDiagnosisContext,
  type SmsVerdict,
  type Verdict,
} from "coss/diagnose";
export {
  type CossMcpServerOptions,
  createCossMcpServer,
  TOOLSET_NAMES,
  type Toolset,
} from "./server.ts";
export type { DocsOptions } from "./tools/docs.ts";
export { VERSION } from "./version.ts";
