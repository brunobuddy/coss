/**
 * Keeps the deployment spec honest: every variable an app validates is declared for its service,
 * everything declared reaches tasks through turbo, and the Dockerfiles use the repo's versions.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ZONE_ROUTES, type ZoneRoute } from "@coss/auth/slugs";
import { billingEnvShape } from "@coss/billing/env";
import { emailEnvShape, emailWorkerEnvShape } from "@coss/email/env";
import { hookEnvShape } from "@coss/hooks/env";
import { sentryEnvShape } from "@coss/observability/env";
import { rateLimitEnvShape } from "@coss/ratelimit/env";
import { screeningEnvShape } from "@coss/screening/env";
import { signSealEnvShape } from "@coss/sign/env";
import { smsEnvShape } from "@coss/sms/env";
import { webhookEnvShape } from "@coss/webhooks/env";
import {
  albListenerRules,
  cossComCacheBehaviours,
  DASHBOARD_HOST,
  deployInvalidationPaths,
  EXTERNAL_ZONES,
  FORMS_HOST,
  FORMS_ORIGIN_VERIFY_HEADER,
  HOSTED_REDIRECTS,
  type HostedDistribution,
  TRACKING_ORIGIN_VERIFY_HEADER,
} from "../aws/routing.ts";
import { SERVICES, type ServiceName } from "../aws/services.ts";
import { awsSpec, awsSpecJson } from "../aws/spec.ts";

const ROOT = path.resolve(import.meta.dir, "../..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const readTurbo = () =>
  JSON.parse(read("turbo.json")) as { globalEnv: string[]; globalPassThroughEnv: string[] };

/** Keys of an app's t3-env `server` schema, including the spread email shape. */
function schemaKeys(envFile: string, spread: Record<string, unknown>): string[] {
  const source = read(envFile);
  const own = [...source.matchAll(/^ {4}([A-Z][A-Z0-9_]+):/gm)].map((match) => match[1] ?? "");
  return [
    ...own,
    ...(source.includes("...email") ? Object.keys(spread) : []),
    ...(source.includes("...rateLimitEnvShape") ? Object.keys(rateLimitEnvShape) : []),
    ...(source.includes("...hookEnvShape") ? Object.keys(hookEnvShape) : []),
    ...(source.includes("...screeningEnvShape") ? Object.keys(screeningEnvShape) : []),
    ...(source.includes("...sentryEnvShape") ? Object.keys(sentryEnvShape) : []),
    ...(source.includes("...webhookEnvShape") ? Object.keys(webhookEnvShape) : []),
    ...(source.includes("...billingEnvShape") ? billingKeys(envFile) : []),
    ...(source.includes("...smsEnvShape") ? Object.keys(smsEnvShape) : []),
    ...(source.includes("...signSealEnvShape") ? Object.keys(signSealEnvShape) : []),
  ];
}

/** The billing variables an app reads: the webhook secret only matters to the dashboard. */
function billingKeys(envFile: string): string[] {
  const keys = Object.keys(billingEnvShape);
  return envFile.startsWith("apps/web/")
    ? keys
    : keys.filter((key) => key !== "STRIPE_WEBHOOK_SECRET");
}

const SCHEMAS: Record<Exclude<ServiceName, "site">, string[]> = {
  web: schemaKeys("apps/web/src/env.ts", emailEnvShape),
  api: schemaKeys("apps/api/src/env.ts", emailEnvShape),
  worker: schemaKeys("apps/worker/src/env.ts", emailWorkerEnvShape),
  portal: schemaKeys("apps/portal/src/env.ts", {}),
  sign: schemaKeys("apps/sign/src/env.ts", {}),
  scheduling: schemaKeys("apps/scheduling/src/env.ts", {}),
  smtp: schemaKeys("apps/smtp/src/env.ts", emailEnvShape),
};

describe("services", () => {
  for (const [name, keys] of Object.entries(SCHEMAS)) {
    test(`${name}: every validated variable is declared`, () => {
      const service = SERVICES.find((candidate) => candidate.name === name);
      const declared = new Set(service?.env.map((variable) => variable.name));
      expect(keys.length).toBeGreaterThan(2);
      for (const key of keys)
        expect({ key, declared: declared.has(key) }).toEqual({ key, declared: true });
    });
  }

  test("declared variables reach tasks (turbo strict env mode) unless the image sets them", () => {
    const turbo = readTurbo();
    const reaching = new Set([...turbo.globalEnv, ...turbo.globalPassThroughEnv]);
    for (const service of SERVICES) {
      for (const variable of service.env) {
        if (variable.kind === "image") continue;
        expect({ name: variable.name, inTurbo: reaching.has(variable.name) }).toEqual({
          name: variable.name,
          inTurbo: true,
        });
      }
    }
  });

  test("only variables that change build output are part of turbo's task hashes", () => {
    // The remote cache shares results between laptops and CI, whose runtime settings differ.
    // A variable belongs in globalEnv only if it changes what a task produces (verified for
    // these by building with different runtime values); everything else is pass-through.
    expect(readTurbo().globalEnv).toEqual(["NODE_ENV", "NEXT_DEPLOYMENT_ID"]);
  });

  test("image variables are set by the service's Dockerfile", () => {
    for (const service of SERVICES) {
      const dockerfile = read(service.dockerfile);
      for (const variable of service.env.filter((candidate) => candidate.kind === "image")) {
        expect(dockerfile).toMatch(new RegExp(`\\b${variable.name}=${variable.value}\\b`));
      }
      if (service.port) expect(dockerfile).toContain(`EXPOSE ${service.port}`);
      for (const port of new Set(service.tcpPorts?.map((mapping) => mapping.container))) {
        expect(dockerfile).toMatch(new RegExp(`^EXPOSE .*\\b${port}\\b`, "m"));
      }
    }
  });

  test("Fargate limits", () => {
    for (const service of SERVICES) expect(service.stopTimeout).toBeLessThanOrEqual(120);
  });
});

describe("hosted distributions", () => {
  const spec = awsSpec();
  const rules = albListenerRules();

  const distributions = spec.cloudFront.hostedDistributions as Record<string, HostedDistribution>;
  for (const [name, hosted] of Object.entries(distributions)) {
    test(`${name} sends the header its load balancer rule requires`, () => {
      const headers = rules.flatMap((rule) =>
        rule.conditions.flatMap((condition) =>
          condition.Field === "http-header" ? [condition.HttpHeaderConfig] : [],
        ),
      );
      expect(headers).toContainEqual({
        HttpHeaderName: hosted.originVerifyHeader,
        Values: [hosted.originVerifySecret],
      });
    });
  }

  test("redirects never point at a host that only redirects", () => {
    const redirects = Object.entries(HOSTED_REDIRECTS);
    for (const [, { to }] of redirects) {
      expect(redirects.map(([host]) => `https://${host}`)).not.toContain(to);
    }
  });
});

describe("Dockerfiles", () => {
  const pkg = JSON.parse(read("package.json")) as {
    packageManager: string;
    engines: { node: string };
    devDependencies: Record<string, string>;
  };
  const bunVersion = pkg.packageManager.replace(/^bun@/, "");
  const nodeMajor = pkg.engines.node.replace(/^>=/, "");

  for (const service of SERVICES) {
    test(`${service.dockerfile} patches its runtime stage`, () => {
      const runtime = read(service.dockerfile).split(/ AS runtime\n/)[1] ?? "";
      expect(runtime).toContain('ARG BASE_PATCH_WEEK=""');
      expect(runtime).toContain("apt-get -y -qq upgrade");
      expect(runtime).toContain("--purge --force-remove-essential --force-depends perl-base");
    });

    test(`${service.dockerfile} pins the repo's Bun, Node and turbo`, () => {
      const dockerfile = read(service.dockerfile);
      expect(dockerfile).toContain(`ARG BUN_VERSION=${bunVersion}\n`);
      expect(dockerfile).toContain(`ARG TURBO_VERSION=${pkg.devDependencies.turbo}\n`);
      if (dockerfile.includes("ARG NODE_VERSION")) {
        expect(dockerfile).toContain(`ARG NODE_VERSION=${nodeMajor}\n`);
      }
      expect(dockerfile).toContain("bun install --frozen-lockfile");
      // DATABASE_URL verifies RDS's certificate against this bundle (sslrootcert).
      if (service.env.some((variable) => variable.name === "DATABASE_URL")) {
        expect(dockerfile).toContain("/etc/ssl/certs/rds-global-bundle.pem");
      }
      expect(dockerfile).toMatch(/^USER (node|bun)$/m);
    });
  }

  test("a Next app's image includes its public/ folder (the standalone output leaves it out)", () => {
    for (const app of ["web", "site"]) {
      if (!existsSync(path.join(ROOT, `apps/${app}/public`))) continue;
      expect(read(`apps/${app}/Dockerfile`)).toContain(
        `COPY --from=build /repo/apps/${app}/public ./apps/${app}/public`,
      );
    }
  });

  test(".dockerignore keeps env files out of every image", () => {
    const ignored = read(".dockerignore").split("\n");
    for (const pattern of [".env", ".env.*", "**/.env", "**/.env.*", "**/node_modules"]) {
      expect(ignored).toContain(pattern);
    }
  });
});

describe("routing", () => {
  const rules = albListenerRules();

  test("every rule fits the ALB limits and requires CloudFront's origin header", () => {
    for (const rule of rules) {
      const values = rule.conditions.flatMap((condition) =>
        "PathPatternConfig" in condition
          ? condition.PathPatternConfig.Values
          : "HostHeaderConfig" in condition
            ? condition.HostHeaderConfig.Values
            : condition.HttpHeaderConfig.Values,
      );
      // One value to spare: the origin header carries two values while its secret rotates.
      expect(values.length).toBeLessThanOrEqual(4);
      expect(rule.conditions.some((condition) => condition.Field === "http-header")).toBe(true);
    }
    expect(new Set(rules.map((rule) => rule.priority)).size).toBe(rules.length);
    // The ALB evaluates rules by priority, so priorities follow the rules' order.
    expect(rules.map((rule) => rule.priority)).toEqual(
      [...rules.map((rule) => rule.priority)].sort((a, b) => a - b),
    );
  });

  test("the API host first, the dashboard last, site paths in between", () => {
    expect(rules[0]?.targetGroup).toBe("api");
    // Last of coss.com's rules: after it, only hosts of their own (appended there so a new one
    // never renumbers the live rules).
    const dashboard = rules.findIndex((rule) => rule.targetGroup === "web");
    expect(rules.filter((rule) => rule.targetGroup === "web")).toHaveLength(1);
    for (const rule of rules.slice(dashboard + 1)) {
      expect(
        rule.conditions.some(
          (condition) =>
            condition.Field === "host-header" &&
            !condition.HostHeaderConfig.Values.includes(DASHBOARD_HOST),
        ),
      ).toBe(true);
    }
    const sitePaths = rules
      .filter((rule) => rule.targetGroup === "site")
      .flatMap((rule) =>
        rule.conditions.flatMap((condition) =>
          condition.Field === "path-pattern" ? condition.PathPatternConfig.Values : [],
        ),
      );
    expect(sitePaths).toEqual(expect.arrayContaining(["/", "/docs", "/docs/*", "/site-assets/*"]));
    expect(sitePaths).not.toContain("/api/*");
  });

  test("tracking routes on customer hostnames reach the API only with CloudFront's header", () => {
    const tracking = rules.find((rule) =>
      rule.conditions.some(
        (condition) =>
          condition.Field === "http-header" &&
          condition.HttpHeaderConfig.HttpHeaderName === TRACKING_ORIGIN_VERIFY_HEADER,
      ),
    );
    expect(tracking?.targetGroup).toBe("api");
    expect(tracking?.conditions.map((condition) => condition.Field)).toEqual([
      "path-pattern",
      "http-header",
    ]);
    expect(tracking?.conditions[0]).toEqual({
      Field: "path-pattern",
      PathPatternConfig: { Values: ["/t/*"] },
    });
    // Before the coss.com path rules and the dashboard.
    expect(rules.indexOf(tracking as (typeof rules)[number])).toBe(1);
    const worker = SERVICES.find((service) => service.name === "worker");
    const target = worker?.env.find((v) => v.name === "TRACKING_CNAME_TARGET");
    expect(target).toMatchObject({ kind: "plain", required: true });
    expect(target?.value).toBeUndefined();
  });

  test("the forms host reaches the API, only on /f/* and only with its origin header", () => {
    const forms = rules.find((rule) =>
      rule.conditions.some(
        (condition) =>
          condition.Field === "http-header" &&
          condition.HttpHeaderConfig.HttpHeaderName === FORMS_ORIGIN_VERIFY_HEADER,
      ),
    );
    expect(forms?.targetGroup).toBe("api");
    expect(forms?.conditions.slice(0, 2)).toEqual([
      { Field: "host-header", HostHeaderConfig: { Values: [FORMS_HOST] } },
      { Field: "path-pattern", PathPatternConfig: { Values: ["/f/*"] } },
    ]);
  });

  test("CloudFront caches site paths and hashed assets, never the dashboard or auth", () => {
    const patterns = cossComCacheBehaviours().map((behaviour) => behaviour.pathPattern);
    expect(patterns).toEqual(
      expect.arrayContaining(["/docs/*", "/site-assets/*", "/_next/static/*"]),
    );
    for (const pattern of patterns) expect(pattern.startsWith("/api")).toBe(false);
    expect(patterns).not.toContain("/");
    // CloudFront's "Cache behaviors per distribution" quota (L-F432D044, default 75).
    expect(patterns.length).toBeLessThanOrEqual(75);
  });

  test("deploys invalidate the site's cached paths, never hashed assets or external zones", () => {
    const paths = deployInvalidationPaths();
    expect(paths).toEqual(
      expect.arrayContaining(["/docs*", "/legal*", "/pricing*", "/shipyard*", "/llms.txt"]),
    );
    for (const kept of [
      "/_next/static/*",
      "/site-assets/*",
      "/site-assets*",
      "/ui*",
      "/origin*",
      "/qnot*",
      "/*",
    ]) {
      expect(paths).not.toContain(kept);
    }
    // A page's cached RSC payloads (`/pricing?_rsc=…`) only go with a wildcard path.
    for (const route of ZONE_ROUTES as readonly ZoneRoute[]) {
      if (route.zone !== "site" || route.path === "/" || route.path === "/site-assets") continue;
      const file = !route.prefix && /\.[a-z]+$/.test(route.path);
      expect(paths).toContain(file ? route.path : `${route.path}*`);
    }
    // CloudFront: at most 15 wildcard paths in progress per distribution.
    expect(paths.filter((path) => path.includes("*")).length).toBeLessThanOrEqual(15);
  });

  test("external zones go to their own CloudFront origins, never the ALB", () => {
    const albPaths = rules.flatMap((rule) =>
      rule.conditions.flatMap((condition) =>
        condition.Field === "path-pattern" ? condition.PathPatternConfig.Values : [],
      ),
    );
    const behaviours = cossComCacheBehaviours();
    const external = (ZONE_ROUTES as readonly ZoneRoute[]).filter((r) => r.zone !== "site");
    expect(external.map((route) => route.zone).sort()).toEqual([...EXTERNAL_ZONES].sort());
    for (const route of external) {
      expect(albPaths).not.toContain(route.path);
      const own = behaviours.filter(
        (behaviour) =>
          behaviour.pathPattern === route.path ||
          behaviour.pathPattern.startsWith(`${route.path}/`),
      );
      expect(own.map((behaviour) => behaviour.pathPattern).sort()).toEqual(
        [route.path, `${route.path}/*`].sort(),
      );
      for (const behaviour of own) expect(behaviour.origin as string).toBe(route.zone);
    }
    const externalPatterns = new Set(external.flatMap((r) => [r.path, `${r.path}/*`]));
    for (const behaviour of behaviours.filter((b) => !externalPatterns.has(b.pathPattern))) {
      expect(behaviour.origin).toBe("alb");
    }
  });
});

describe("terraform", () => {
  test("terraform/spec.json matches the spec (run `bun run --cwd infra aws:spec:write`)", () => {
    expect(read("infra/terraform/spec.json")).toBe(awsSpecJson());
  });
});

describe("TLS to the containers", () => {
  const entryCommand = (name: string) =>
    name === "api" ? "apps/api/src/index.ts" : `apps/${name}/server.js`;
  for (const service of SERVICES.filter((candidate) => candidate.port !== undefined)) {
    test(`${service.name}: its image serves tlsPort through tls-entry`, () => {
      const dockerfile = read(`apps/${service.name}/Dockerfile`);
      expect(service.tlsPort).toBeNumber();
      expect(dockerfile).toContain(`TLS_PORT=${service.tlsPort}`);
      expect(dockerfile).toContain("COPY infra/runtime/tls-entry.mjs ./tls-entry.mjs");
      expect(dockerfile).toContain(`"tls-entry.mjs", "${entryCommand(service.name)}"`);
    });
  }
});
