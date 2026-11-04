# integrations — framework mail drivers

Read together with the root `AGENTS.md` (conventions, tenancy rule, tests). Paths are from the
repository root.

- **Framework drivers** (`integrations/*`, not part of the SDK): Laravel, Rails and Django follow the same mapping and
  retry rules as the JS integrations, written down in `integrations/README.md` and checked by every driver's tests
  against `integrations/conformance/{http,message}.json` (`webhooks.json` is the generated SDKs', checked against
  `verifyWebhook` by `packages/sdk/test/webhooks-conformance.test.ts`) (generated from `packages/sdk/src/core/mime.ts`'s behaviour: change the
  README, the JSON, the SDK and all three drivers together). Each keeps `Coss-Version` and the reserved-header list as
  hand mirrors of `API_VERSION` and `RESERVED_HEADERS`. Releases: `.github/workflows/release-integrations.yml` (below).
- **Publishing the framework drivers** (`.github/workflows/release-integrations.yml`, on pushes to `main` touching
  `integrations/**`): a driver whose version file (`laravel/src/Version.php`, `rails/lib/coss/rails/version.rb`,
  `django/src/coss_django/__init__.py`, with its `CHANGELOG.md`) names a version its registry doesn't have is tested,
  published and tagged `coss-<driver>@<version>`. PyPI (`pypi` environment) and RubyGems (`rubygems` environment) use
  trusted publishing; Packagist reads `cosscom/coss-laravel`, a read-only mirror the job pushes `git subtree split
  --prefix integrations/laravel` and a `v<version>` tag to with the deploy key `COSS_LARAVEL_DEPLOY_KEY` (`packagist`
  environment) — never commit to the mirror. Every job is skipped until the repository variable
  `INTEGRATIONS_PUBLISH` is `true`.
