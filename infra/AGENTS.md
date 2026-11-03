# AGENTS.md — infra (deployment spec and production)

Machine-readable description of the AWS deployment and the Terraform that provisions it; the human runbook is
README.md, "Deploying to AWS". `bun run --cwd infra aws:spec` prints the whole spec as JSON.

| File | What |
|---|---|
| `aws/services.ts` | The ECS services (Dockerfile, port, health check, NLB TCP ports (`tcpPorts`: the SMTP relay), stop timeout, size, task-role policy, every env var and whether it is plain, a Secrets Manager secret or set by the image) and the one-off tasks (migrate, ses-bootstrap, create-admin). |
| `aws/routing.ts` | ALB listener rules and CloudFront cached behaviours, generated from `ZONE_ROUTES` (`@coss/auth/slugs`). The external zones (the coss ui repository's `/ui` and `/origin`, the qnot repository's `/qnot`, all on Vercel) are CloudFront origins of their own, never ALB targets. |
| `aws/spec.ts` | The whole spec as one object; `aws:spec:write` writes it to `terraform/spec.json`. |
| `terraform/` | Production (account 294417174674, us-east-2): network, ECR, RDS, ECS, ALB, CloudFront + WAF, the NLB of plain-TCP services (`nlb.tf`), IAM, alarms and cost guardrails (`monitoring.tf`), the CodeBuild-hosted Actions runners of the deploy workflow. Reads `spec.json` for everything the spec owns (env names/kinds, sizes, rules, behaviours); `production.tfvars` holds the plain values. State in S3 (`coss-tfstate-294417174674`). |
| `organization/` | The AWS Organization's management account (456651119109, us-east-2), a Terraform root of its own: the org-wide audit trail (`coss-organization`, in an Object Lock bucket for six years), GuardDuty, the org's Access Analyzer, the SCP keeping production's monitoring on, the read-only role the admin console assumes, and forwarding of security events to production's bus. See "Security monitoring". |
| `terraform/scripts/put-secret.sh` | Sets one key of the stage secret (`coss/production`) from the clipboard, stdin or a random value, never printing it or passing it in a process's arguments (values travel through pipes). |
| `scripts/build-images.sh` | Builds services' images for a commit (zstd layers) and pushes them to ECR, in parallel (the Deploy workflow's build jobs). |
| `scripts/ecs-deploy.sh`, `scripts/ecs-task.sh` | Roll services out to an image tag (used by `.github/workflows/deploy.yml`); run one-off commands (migrate, ses-bootstrap, create-admin) in a service's task definition. |
| `scripts/ecs-wait-drained.sh` | Waits until a service's old tasks are gone (the Deploy workflow's step before invalidating the CDN, so an old task can't put its page back in the cache). |
| `scripts/newer-deployed.sh` | The Deploy workflow's guard before migrating and rolling out: skips when production already runs a commit that includes this one. |
| `scripts/check-routing.sh` | Read-only: fails when the live ALB rules or coss.com cached behaviours differ from `terraform/spec.json` (the Deploy workflow's last step; a routing change needs `terraform apply`). |
| `test/spec.test.ts` | Fails when an app validates a variable its service doesn't declare, a declared one is missing from `turbo.json` `globalEnv`/`globalPassThroughEnv`, `globalEnv` gains a variable (task hashes must match across machines for the remote cache), a Dockerfile drifts from the repo's Bun/Node/turbo versions, a rule breaks ALB limits, an external zone reaches the ALB, or `terraform/spec.json` is stale. |

Rules: when an app gains an env var, declare it in `aws/services.ts` too (plus the usual `.env.example`, t3-env,
`turbo.json`), run `bun run --cwd infra aws:spec:write`, and give a plain one its value in
`terraform/production.tfvars` (the plan fails for a required plain variable without one) or a secret one its key with
`put-secret.sh`. An optional secret that isn't stored goes in `unset_secrets` (tfvars) instead: every declared secret
is mapped into the task definition, and ECS can't start a task whose secret names a missing key. Routing changes go into `ZONE_ROUTES` (new site routes appended after the last site entry, so no live rule is renumbered; the extra rules take the priorities below the dashboard's, `SITE_RULES_ON_TENS` in `aws/routing.ts`), never into this folder (a new external zone also needs its host
in `external_origin_hosts`). Terraform applies the generated rules as printed (priorities, the origin header on every
rule, a fixed 403 default action). Never put secret values in tfvars, the state or a commit; `terraform apply` needs
admin credentials for the account and is run by a human or an agent they asked, not by CI. Services ignore
`task_definition` changes: after an environment change, run the Deploy workflow (it registers revisions from the
latest task definition). Terraform's own task definitions use the deployed image tag (SSM `/coss/production/image-tag`),
so a plan after a deploy shows them being replaced: harmless, it only re-registers them with the running image.

## Security monitoring

`/admin/security` (`apps/web/src/lib/security-posture.ts`) shows all of this in plain language; a read that fails is
shown as unknown, never as fine. Production (`terraform/security.tf`): GuardDuty, Security Hub (AWS's foundational
best practices), Config, VPC flow logs and load balancer and CloudFront logs in the access logs bucket
(`RETENTION_DAYS.accessLogs`), the alerts below. These run only in `us-east-2`: the SCP
`AdvancedModeRegionRestrictionSecurityControlPolicy` denies them in production's other regions, as it does anything
else. The network load balancer's TCP listeners write no access logs (flow logs cover them).

Alerts go to the `coss-alerts` email: GuardDuty severity 7 and up, any root use, changes to the audit trail, and
resources newly reachable from outside the organization. The management account forwards its events to production's
default bus, whose rules send them.

`organization/` is applied by hand, by a human or an agent they asked, with management credentials
(`aws login --profile coss-management --region us-east-2`, choosing the COSS Management Account;
`AWS_PROFILE=coss-management terraform apply`). Its state bucket, `coss-org-tfstate-456651119109`, was created once by
hand like production's. `aws_organizations_organization` lists every trusted service: enabling one elsewhere means
adding it there, or the next apply turns it off. The `ProtectSecurityMonitoring` SCP denies changes to production's
detector and recorder, so a Terraform change to them needs that SCP detached first (from the management account).
A new AWS account in the organization is covered by the trail and Access Analyzer, but needs its own GuardDuty.

The database audits schema and role changes with pgaudit (no parameters or reads, which can hold customer data), and
its log group keeps a year. After a fresh database, once the parameter group's `shared_preload_libraries` is applied by
a reboot: `infra/scripts/ecs-task.sh worker -- sh -c "cd packages/db && bun -e '…CREATE EXTENSION IF NOT EXISTS pgaudit…'"` (`pg` only resolves from there). SNS topics are
encrypted with `alias/coss-production-sns`, whose key policy must name every service that publishes to them: one
missing loses its messages silently.

The load balancer reaches containers over TLS: `runtime/tls-entry.mjs`, copied into each image, terminates it on
`tlsPort` with a certificate made at start (the load balancer doesn't validate target certificates) and pipes to the
app's plain port. `tls-entry.mjs` runs the app in its own process, so SIGTERM and draining are the app's as before.
It also sets `HOSTNAME=0.0.0.0` first: Fargate overwrites the image's value, and Next binds to whatever it says. The
apps' plain ports are closed to the load balancer by the security groups.
