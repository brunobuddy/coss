/**
 * The whole deployment spec as one JSON-serializable object: printed by `aws:spec` and written to
 * `terraform/spec.json` (which Terraform reads) by `aws:spec:write`. Placeholders like
 * <origin-verify-secret> are filled in at provisioning time.
 */
import {
  ALB_IDLE_TIMEOUT_SECONDS,
  albListenerRules,
  cossComCacheBehaviours,
  deployInvalidationPaths,
  EXTERNAL_ORIGIN_REQUEST_POLICY,
  EXTERNAL_ZONES,
  FORMS_OTHER_PATHS_REDIRECT,
  HOSTED_REDIRECTS,
  hostedDistributions,
  NEXT_CACHE_KEY_HEADERS,
  ORIGIN_VERIFY_HEADER,
  ORIGIN_VERIFY_PLACEHOLDER,
  TRACKING_ORIGIN_VERIFY_HEADER,
  TRACKING_ORIGIN_VERIFY_PLACEHOLDER,
} from "./routing.ts";
import { ONE_OFF_TASKS, SERVICES } from "./services.ts";

export function awsSpec() {
  return {
    services: SERVICES,
    oneOffTasks: ONE_OFF_TASKS,
    alb: {
      idleTimeoutSeconds: ALB_IDLE_TIMEOUT_SECONDS,
      httpsListener: {
        defaultAction: { Type: "fixed-response", FixedResponseConfig: { StatusCode: "403" } },
        rules: albListenerRules(),
      },
      placeholders: {
        [ORIGIN_VERIFY_PLACEHOLDER]: "the origin-verify secret (CloudFront's custom header)",
        [TRACKING_ORIGIN_VERIFY_PLACEHOLDER]: `the ${TRACKING_ORIGIN_VERIFY_HEADER} secret (the tracking distributions' custom header)`,
      },
    },
    cloudFront: {
      origins: {
        alb: {
          customHeader: {
            HeaderName: ORIGIN_VERIFY_HEADER,
            HeaderValue: ORIGIN_VERIFY_PLACEHOLDER,
          },
          originRequestPolicy: "Managed-AllViewer",
        },
        ...Object.fromEntries(
          EXTERNAL_ZONES.map((zone) => [
            zone,
            {
              host: `the ${zone} zone's production hostname (Vercel), set at provisioning`,
              originRequestPolicy: EXTERNAL_ORIGIN_REQUEST_POLICY,
            },
          ]),
        ),
      },
      cachePolicies: {
        default: "Managed-CachingDisabled",
        "coss-origin-cache-control": {
          MinTTL: 0,
          DefaultTTL: 0,
          MaxTTL: 31_536_000,
          headers: NEXT_CACHE_KEY_HEADERS,
          queryStrings: "all",
          cookies: "none",
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
        },
      },
      distributions: {
        "coss.com": { cachedBehaviours: cossComCacheBehaviours() },
        "api.coss.com": { cachedBehaviours: [] },
      },
      hostedDistributions: hostedDistributions(),
      hostedRedirects: HOSTED_REDIRECTS,
      formsOtherPathsRedirect: FORMS_OTHER_PATHS_REDIRECT,
      invalidateAfterDeploy: deployInvalidationPaths(),
    },
  };
}

/** The exact contents of `terraform/spec.json`. */
export function awsSpecJson(): string {
  return `${JSON.stringify(awsSpec(), null, 2)}\n`;
}
