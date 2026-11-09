import "server-only";
import { env } from "@/env";
import {
  batchShipsAt,
  CANCELABLE_PHASES,
  commitSummary,
  currentStep,
  DEPLOY_BRANCH,
  DEPLOY_PHASES,
  DEPLOY_REPOSITORY,
  type DeployPhase,
  deployedCommit,
  deployRunPhase,
  elapsedMs,
  failureLogExcerpt,
  findPreviousRollout,
  firstParentChain,
  type GitHubCommit,
  type GitHubJob,
  type GitHubRun,
  isImageTagRun,
  type LogLine,
  latestProductionJobAt,
  latestRolloutBefore,
  ROLLED_OUT_PHASES,
  rolloutTimes,
  type StepState,
  stepState,
} from "./deploy-runs";
import { githubAppJwt, githubAppPrivateKey } from "./github-app";

/**
 * The admin console's deploys page: reads the Deploy workflow's runs and main's commits, and
 * dispatches the workflow, through the coss.com Deploy GitHub App (DEPLOY_GITHUB_APP_ID and
 * DEPLOY_GITHUB_APP_PRIVATE_KEY; README, "Deploying from the admin console"). Its installation
 * token can read the repository and run its workflows, nothing else: the workflow itself refuses
 * anything but main, so the most this can do is ship main early or redeploy an earlier commit.
 */

const API = "https://api.github.com";
const REPO = `/repos/${DEPLOY_REPOSITORY}`;
const DEPLOY_WORKFLOW = "deploy.yml";
const CI_WORKFLOW = "ci.yml";
/** Runs shown, each with one jobs request. */
const RUNS_SHOWN = 12;

export function deploysConfigured(): boolean {
  return Boolean(env.DEPLOY_GITHUB_APP_ID && env.DEPLOY_GITHUB_APP_PRIVATE_KEY);
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

let installationId: number | undefined;
let installationToken: { value: string; expiresAt: number } | undefined;

/**
 * The last answer to each GET with its ETag: the pages poll, and GitHub doesn't count a
 * conditional request answered 304 (unchanged) against the rate limit. Bodies are shared, never
 * mutated.
 */
const conditional = new Map<string, { etag: string; body: unknown }>();
const CONDITIONAL_ENTRIES = 300;

/**
 * `fetch` with a timeout, asked once more for a GET that GitHub doesn't answer in time or answers
 * with a 5xx: when Actions is degraded, some reads (a run's jobs) stall for ten seconds and end in
 * a 502, and the same read asked again usually answers within a few seconds.
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  const attempt = () => fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if ((init.method ?? "GET") !== "GET") return attempt();
  try {
    const response = await attempt();
    if (response.status < 500) return response;
    await response.body?.cancel();
  } catch {
    // Timed out or no connection: asked again below.
  }
  return attempt();
}

async function call<T>(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const cached = method === "GET" ? conditional.get(path) : undefined;
  let response: Response;
  try {
    response = await send(`${API}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "coss-dashboard",
        "x-github-api-version": "2026-03-10",
        ...(cached ? { "if-none-match": cached.etag } : {}),
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch (error) {
    throw new GitHubError(`GitHub didn't answer (${(error as Error).message}).`);
  }
  if (response.status === 304 && cached) return cached.body as T;
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const message = (detail as { message?: string } | null)?.message ?? response.statusText;
    throw new GitHubError(
      `GitHub answered ${response.status} to ${path}: ${message}`,
      response.status,
    );
  }
  if (response.status === 204 || response.status === 202) return undefined as T;
  const body = await response.json();
  const etag = response.headers.get("etag");
  if (method === "GET" && etag) {
    conditional.delete(path);
    conditional.set(path, { etag, body });
    if (conditional.size > CONDITIONAL_ENTRIES) {
      conditional.delete(conditional.keys().next().value as string);
    }
  }
  return body as T;
}

/** An installation token for the repository, cached until five minutes before it expires. */
async function token(): Promise<string> {
  if (installationToken && installationToken.expiresAt - 5 * 60_000 > Date.now()) {
    return installationToken.value;
  }
  if (!env.DEPLOY_GITHUB_APP_ID || !env.DEPLOY_GITHUB_APP_PRIVATE_KEY) {
    throw new GitHubError("Deploys aren't set up: DEPLOY_GITHUB_APP_ID and its private key.");
  }
  const jwt = githubAppJwt(
    env.DEPLOY_GITHUB_APP_ID,
    githubAppPrivateKey(env.DEPLOY_GITHUB_APP_PRIVATE_KEY),
  );
  installationId ??= (await call<{ id: number }>(`${REPO}/installation`, jwt)).id;
  // Only what this page uses, whatever else the app was granted.
  const created = await call<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    jwt,
    {
      method: "POST",
      body: {
        repositories: [DEPLOY_REPOSITORY.split("/")[1]],
        permissions: { actions: "write", contents: "read" },
      },
    },
  );
  installationToken = { value: created.token, expiresAt: Date.parse(created.expires_at) };
  return created.token;
}

async function github<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return call<T>(path, await token(), init);
}

export type CiState = "success" | "failure" | "running" | "canceled" | "none";

/** One of main's own commits (a merged pull request, or a commit pushed to main). */
export type MainCommit = {
  sha: string;
  url: string;
  title: string;
  pullRequest: number | null;
  author: { name: string; avatarUrl: string | null };
  committedAt: string | null;
  ci: CiState;
};

export type DeployRun = {
  id: number;
  url: string;
  phase: DeployPhase;
  /** The commit it ships (`null`: an old redeploy that doesn't say). */
  commit: string | null;
  title: string;
  trigger: "push" | "manual" | "image_tag";
  actor: string | null;
  createdAt: string;
  /** A push waiting for a quieter main: when its batch ships if nothing newer is pushed. */
  shipsAt: string | null;
  /** What an active run is doing right now (its running step). */
  step: string | null;
  /** From the start of its latest attempt to its end (so far, while active). */
  durationMs: number | null;
};

export type DeployOverview = {
  /** The commit production runs: this dashboard's own build, else the last run that deployed. */
  live: string | null;
  main: string;
  /** Main's own commits (merges, first parents) that production doesn't run yet, newest first. */
  pending: MainCommit[];
  /** More commits are pending than GitHub's compare returned. */
  pendingTruncated: boolean;
  runs: DeployRun[];
};

function ciState(run: GitHubRun | undefined): CiState {
  if (!run) return "none";
  if (run.status !== "completed") return "running";
  if (run.conclusion === "success") return "success";
  if (run.conclusion === "cancelled" || run.conclusion === "skipped") return "canceled";
  return "failure";
}

type RunWithJobs = { run: GitHubRun; jobs: GitHubJob[]; phase: DeployPhase };

/**
 * Jobs read, by run id and attempt. A finished run's never change, and the page refreshes itself
 * while a run is active (an installation token gets 5,000 requests an hour); for the pages, an
 * active run's last read stands in when GitHub doesn't answer the next one, so one failed read
 * doesn't blank them.
 */
const readJobs = new Map<string, { jobs: GitHubJob[]; finished: boolean }>();

/**
 * A run's jobs and what it is doing: its latest attempt's, or an earlier `attempt`'s (finished,
 * so cached; its phase is then read against the latest attempt's status). `fresh`: never an
 * active run's previous read (what decides a cancellation must not be out of date).
 */
async function withJobs(
  run: GitHubRun,
  attempt?: number,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<RunWithJobs> {
  const latest = run.run_attempt ?? 1;
  const key = `${run.id}:${attempt ?? latest}`;
  const known = readJobs.get(key);
  if (known?.finished) return { run, jobs: known.jobs, phase: deployRunPhase(run, known.jobs) };
  let jobs: GitHubJob[];
  try {
    ({ jobs } = await github<{ jobs: GitHubJob[] }>(
      attempt === undefined
        ? `${REPO}/actions/runs/${run.id}/jobs?per_page=30`
        : `${REPO}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=30`,
    ));
  } catch (error) {
    if (fresh || !known || !(error instanceof GitHubError)) throw error;
    console.warn(`[web] Showing deploy run ${run.id}'s previous jobs:`, error.message);
    return { run, jobs: known.jobs, phase: deployRunPhase(run, known.jobs) };
  }
  readJobs.delete(key);
  readJobs.set(key, {
    jobs,
    finished: run.status === "completed" || (attempt !== undefined && attempt < latest),
  });
  if (readJobs.size > 100) readJobs.delete(readJobs.keys().next().value as string);
  return { run, jobs, phase: deployRunPhase(run, jobs) };
}

async function recentRuns(options?: { fresh?: boolean }): Promise<RunWithJobs[]> {
  const { workflow_runs: runs } = await github<{ workflow_runs: GitHubRun[] }>(
    `${REPO}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=${DEPLOY_BRANCH}&per_page=${RUNS_SHOWN}`,
  );
  return Promise.all(runs.map((run) => withJobs(run, undefined, options)));
}

async function mainSha(): Promise<string> {
  return (await github<{ sha: string }>(`${REPO}/commits/${DEPLOY_BRANCH}`)).sha;
}

/**
 * CI's latest merge queue run for each of main's recent commits: only the queue lands commits on
 * main, and main becomes exactly the commit it checked (same sha).
 */
async function ciRunsBySha(): Promise<Map<string, GitHubRun>> {
  const ci = await github<{ workflow_runs: GitHubRun[] }>(
    `${REPO}/actions/workflows/${CI_WORKFLOW}/runs?event=merge_group&per_page=50`,
  );
  const bySha = new Map<string, GitHubRun>();
  for (const run of ci.workflow_runs) if (!bySha.has(run.head_sha)) bySha.set(run.head_sha, run);
  return bySha;
}

/**
 * Main's own commits from `head` back to (not including) `base`, newest first. `truncated`: there
 * are more than GitHub's compare returns (the list then stops before `base`).
 */
async function mainCommitsBetween(
  base: string,
  head: string,
  ciBySha: Map<string, GitHubRun>,
): Promise<{ commits: MainCommit[]; truncated: boolean }> {
  if (base === head) return { commits: [], truncated: false };
  const compare = await github<{ commits: GitHubCommit[]; ahead_by: number }>(
    `${REPO}/compare/${base}...${head}`,
  );
  let commits = compare.commits;
  // The compare lists the oldest 250 commits only: past that, the latest 100 before `head`
  // instead (the chain then stops before reaching `base`).
  if (compare.commits.length < compare.ahead_by) {
    commits = await github<GitHubCommit[]>(`${REPO}/commits?sha=${head}&per_page=100`);
  }
  const chain = firstParentChain(commits, head, base);
  return {
    commits: chain.map((commit) => mainCommit(commit, ciBySha)),
    truncated: chain.length > 0 && chain.at(-1)?.parents[0]?.sha !== base,
  };
}

function mainCommit(commit: GitHubCommit, ciBySha: Map<string, GitHubRun>): MainCommit {
  const summary = commitSummary(commit.commit.message);
  return {
    sha: commit.sha,
    url: commit.html_url,
    title: summary.title,
    pullRequest: summary.pullRequest,
    author: {
      name: commit.author?.login ?? commit.commit.author?.name ?? "unknown",
      avatarUrl: commit.author?.avatar_url ?? null,
    },
    committedAt: commit.commit.author?.date ?? null,
    ci: ciState(ciBySha.get(commit.sha)),
  };
}

/** The latest production job start among `runs`: when the `gate` counts from. */
function lastDeployStart(runs: RunWithJobs[]): Date | null {
  const starts = runs.map((entry) => latestProductionJobAt(entry.jobs)).filter((at) => at !== null);
  return starts.length > 0 ? new Date(Math.max(...starts.map(Number))) : null;
}

function deployRun(
  { run, jobs, phase }: RunWithJobs,
  lastDeployAt: Date | null,
  now: Date,
): DeployRun {
  const trigger = run.event === "push" ? "push" : isImageTagRun(run, jobs) ? "image_tag" : "manual";
  return {
    id: run.id,
    url: run.html_url,
    phase,
    commit: deployedCommit(run, jobs),
    title:
      trigger === "push"
        ? commitSummary(run.head_commit?.message ?? run.display_title).title
        : trigger === "image_tag"
          ? "Redeploy of an earlier commit"
          : "Deploy now",
    trigger,
    actor: run.triggering_actor?.login ?? null,
    createdAt: run.created_at,
    shipsAt:
      phase === "waiting"
        ? batchShipsAt(new Date(run.created_at), lastDeployAt).toISOString()
        : null,
    // The gate's one step is what "Waiting for a quiet main" already says.
    step: phase === "building" || phase === "deploying" ? (currentStep(jobs)?.step ?? null) : null,
    durationMs: elapsedMs(
      run.run_started_at ?? run.created_at,
      DEPLOY_PHASES[phase].active ? null : run.updated_at,
      now,
    ),
  };
}

/**
 * Overviews younger than this are shared: every open deploys page polls, and the run page reads
 * the overview too. A dispatch drops it, so the page shows its run right after.
 */
const OVERVIEW_TTL_MS = 4_000;
let overviewCache: { at: number; value: Promise<DeployOverview> } | undefined;

/** Everything the deploys page shows. Throws `GitHubError` when GitHub can't be read. */
export function getDeployOverview(): Promise<DeployOverview> {
  if (overviewCache && Date.now() - overviewCache.at < OVERVIEW_TTL_MS) return overviewCache.value;
  const value = readDeployOverview();
  const entry = { at: Date.now(), value };
  overviewCache = entry;
  // Failures are never shared: the next read tries GitHub again.
  value.catch(() => {
    if (overviewCache === entry) overviewCache = undefined;
  });
  return value;
}

async function readDeployOverview(): Promise<DeployOverview> {
  const [runs, ciBySha, main] = await Promise.all([recentRuns(), ciRunsBySha(), mainSha()]);

  // The build's commit (NEXT_DEPLOYMENT_ID, inlined by `next build`); unset in development.
  // The latest rollout to finish, not the latest run created (a re-run of an older run can be).
  const lastDeployed =
    latestRolloutBefore(runs, new Date(8.64e15))?.entry ??
    runs.find((entry) => ROLLED_OUT_PHASES.includes(entry.phase));
  const live =
    process.env.NEXT_DEPLOYMENT_ID ||
    (lastDeployed ? deployedCommit(lastDeployed.run, lastDeployed.jobs) : null);

  const pending = live
    ? await mainCommitsBetween(live, main, ciBySha)
    : { commits: [], truncated: false };
  const lastDeployAt = lastDeployStart(runs);
  const now = new Date();

  return {
    live,
    main,
    pending: pending.commits,
    pendingTruncated: pending.truncated,
    runs: runs.map((entry) => deployRun(entry, lastDeployAt, now)),
  };
}

/** Push runs that haven't reached their deploy job, by jobs read now (never a previous read). */
async function pendingPushRuns(): Promise<Set<number>> {
  return new Set(
    (await recentRuns({ fresh: true }))
      .filter(({ run, phase }) => run.event === "push" && CANCELABLE_PHASES.includes(phase))
      .map(({ run }) => run.id),
  );
}

/**
 * Dispatches the Deploy workflow, then cancels the push runs that were waiting before it: their
 * commits were on main already, so the dispatch either ships them or (a redeploy) would be undone
 * by them. Pushes made after the dispatch keep their runs. Only runs still before their deploy job
 * are canceled (checked again after the dispatch).
 */
async function dispatchAndCancelPending(
  inputs?: Record<string, string>,
): Promise<{ run: { id: number; commit: string | null } | null; canceledRunIds: number[] }> {
  const before = await pendingPushRuns();
  // GitHub answers with the run it created (204 and no body from older API versions).
  const dispatched = await github<{ workflow_run_id?: number } | undefined>(
    `${REPO}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`,
    { method: "POST", body: { ref: DEPLOY_BRANCH, ...(inputs ? { inputs } : {}) } },
  );
  // The dispatch happened: from here on nothing may throw, or the action would report a failure
  // (inviting a second dispatch) and skip its audit event.
  overviewCache = undefined;
  let run: { id: number; commit: string | null } | null = null;
  const runId = dispatched?.workflow_run_id;
  if (runId) {
    const commit = await github<{ head_sha: string }>(`${REPO}/actions/runs/${runId}`).then(
      (created) => created.head_sha,
      () => null,
    );
    run = { id: runId, commit };
  }
  let still: Set<number>;
  try {
    still = await pendingPushRuns();
  } catch (error) {
    console.error("[web] Deploy dispatched, but the runs to cancel couldn't be read:", error);
    return { run, canceledRunIds: [] };
  }
  const canceled: number[] = [];
  await Promise.all(
    [...before]
      .filter((id) => still.has(id))
      .map(async (id) => {
        // Already finished (409) or gone: nothing to cancel.
        await github(`${REPO}/actions/runs/${id}/cancel`, { method: "POST" }).then(
          () => canceled.push(id),
          () => {},
        );
      }),
  );
  overviewCache = undefined;
  return { run, canceledRunIds: canceled };
}

/**
 * Dispatches the Deploy workflow for main's tip, skipping the batch wait. `commit` is the one its
 * run builds (main when the run started), or main just before the dispatch if GitHub didn't say.
 */
export async function deployMainNow(): Promise<{
  commit: string;
  runId: number | null;
  canceledRunIds: number[];
}> {
  const before = await mainSha();
  const { run, canceledRunIds } = await dispatchAndCancelPending();
  return { commit: run?.commit ?? before, runId: run?.id ?? null, canceledRunIds };
}

/**
 * Dispatches the Deploy workflow with `image_tag`: production goes back to `commit`'s images
 * (already built), until the next deploy of main.
 */
export async function redeployCommit(
  commit: string,
): Promise<{ runId: number | null; canceledRunIds: number[] }> {
  const { run, canceledRunIds } = await dispatchAndCancelPending({ image_tag: commit });
  return { runId: run?.id ?? null, canceledRunIds };
}

/** Commits a past run deployed (other than `live`): the only ones offered for redeploying. */
export function redeployableCommits(overview: DeployOverview): Set<string> {
  return new Set(
    overview.runs.flatMap((run) =>
      ROLLED_OUT_PHASES.includes(run.phase) && run.commit && run.commit !== overview.live
        ? [run.commit]
        : [],
    ),
  );
}

export type DeployStep = {
  number: number;
  name: string;
  state: StepState;
  startedAt: string | null;
  durationMs: number | null;
};

export type DeployJob = {
  id: number | null;
  name: string;
  url: string | null;
  state: StepState;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  steps: DeployStep[];
  /** A failed job's log up to its error (`null`: it didn't fail, or the log couldn't be read). */
  log: LogLine[] | null;
};

/**
 * What a run changes in production, against the commit production ran before it (the previous
 * run that rolled out): main's commits it ships, or those it takes back out (a redeploy of an
 * earlier commit). `unknown`: no earlier rollout among the runs read, or a run that doesn't say
 * which commit it ships. `unreadable`: GitHub failed to answer while they were worked out.
 */
export type DeployChanges =
  | { kind: "ships" | "rolls_back"; base: string; commits: MainCommit[]; truncated: boolean }
  | { kind: "same"; base: string }
  | { kind: "unknown" }
  | { kind: "unreadable"; message: string };

export type DeployRunDetail = {
  run: DeployRun;
  attempt: number;
  startedAt: string;
  /** When the run finished (`null` while active). */
  finishedAt: string | null;
  jobs: DeployJob[];
  changes: DeployChanges;
};

/** Runs read back when looking for the rollout before a run. */
const EARLIER_RUNS_READ = 30;
/** Of those, how many have their jobs read at once (most searches end within a few). */
const EARLIER_RUNS_READ_AHEAD = 8;

/**
 * One Deploy run with its jobs, steps, failed jobs' logs and the changes it ships. `null` when
 * GitHub has no such run, or it isn't a run of main's Deploy workflow.
 */
export async function getDeployRun(id: number): Promise<DeployRunDetail | null> {
  let run: GitHubRun;
  try {
    run = await github<GitHubRun>(`${REPO}/actions/runs/${id}`);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
  if (run.path !== `.github/workflows/${DEPLOY_WORKFLOW}` || run.head_branch !== DEPLOY_BRANCH) {
    return null;
  }
  const [entry, ciBySha] = await Promise.all([withJobs(run), ciRunsBySha()]);
  const now = new Date();
  // Started before the search for the rollout before this run, which they don't depend on (the
  // failed jobs' logs are slow downloads). Never rejects: `failureLog` answers `null` instead.
  const jobs = Promise.all(
    entry.jobs.map(async (job): Promise<DeployJob> => {
      const state = stepState(job);
      return {
        id: job.id ?? null,
        name: job.name,
        url: job.html_url ?? null,
        state,
        startedAt: job.started_at ?? null,
        completedAt: job.completed_at ?? null,
        durationMs: state === "skipped" ? null : elapsedMs(job.started_at, job.completed_at, now),
        steps: (job.steps ?? []).map((step, index) => ({
          number: step.number ?? index + 1,
          name: step.name,
          state: stepState(step),
          startedAt: step.started_at ?? null,
          durationMs: elapsedMs(step.started_at, step.completed_at, now),
        })),
        log: state === "failure" && job.id ? await failureLog(job.id) : null,
      };
    }),
  );
  // The run itself is what the page is for: a failed search for what it changes leaves it shown.
  let lastDeployAt: Date | null = null;
  let changes: DeployChanges;
  try {
    const earlier = await previousRollout(entry, now);
    lastDeployAt = earlier.lastDeployAt;
    changes = await runChanges(earlier.commit, deployedCommit(run, entry.jobs), ciBySha);
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    changes = { kind: "unreadable", message: error.message };
  }
  const detail = deployRun(entry, lastDeployAt, now);
  const active = DEPLOY_PHASES[entry.phase].active;

  return {
    run: detail,
    attempt: run.run_attempt ?? 1,
    startedAt: run.run_started_at ?? run.created_at,
    finishedAt: active ? null : (run.updated_at ?? null),
    jobs: await jobs,
    changes,
  };
}

/**
 * The commit production ran just before `entry`'s rollout started (or, for a run that never got
 * there, when it ended; an active one: now): the rollout that finished last before then, whatever
 * order the runs were created in, earlier attempts of runs that were re-run included. Also the latest production job start among the runs read (the
 * batch estimate).
 */
async function previousRollout(
  entry: RunWithJobs,
  now: Date,
): Promise<{ commit: string | null; lastDeployAt: Date | null }> {
  const { run } = entry;
  const reference =
    rolloutTimes(entry.jobs).startedAt ??
    (DEPLOY_PHASES[entry.phase].active ? now : new Date(run.updated_at ?? run.created_at));
  const list = (created: string) =>
    github<{ workflow_runs: GitHubRun[] }>(
      `${REPO}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=${DEPLOY_BRANCH}&per_page=${EARLIER_RUNS_READ}&created=${encodeURIComponent(created)}`,
    );
  // Runs created before this one, and those created after it but before the reference (they may
  // have rolled out first).
  const [before, after] = await Promise.all([
    list(`<${run.created_at}`),
    reference.getTime() > Date.parse(run.created_at)
      ? list(`${run.created_at}..${reference.toISOString()}`)
      : Promise.resolve({ workflow_runs: [] }),
  ]);
  const candidates = [
    ...new Map(
      [...after.workflow_runs, ...before.workflow_runs].map((candidate) => [
        candidate.id,
        candidate,
      ]),
    ).values(),
  ];

  const { best, read } = await findPreviousRollout(
    run,
    candidates,
    reference,
    withJobs,
    EARLIER_RUNS_READ_AHEAD,
  );
  return {
    commit: best ? deployedCommit(best.entry.run, best.entry.jobs) : null,
    lastDeployAt: lastDeployStart(read),
  };
}

async function runChanges(
  base: string | null,
  head: string | null,
  ciBySha: Map<string, GitHubRun>,
): Promise<DeployChanges> {
  if (!base || !head) return { kind: "unknown" };
  if (base === head) return { kind: "same", base };
  const { status } = await github<{ status: string }>(`${REPO}/compare/${base}...${head}`);
  // `mainCommitsBetween` reads the same compare again: answered 304, from the cache.
  if (status === "ahead") {
    return { kind: "ships", base, ...(await mainCommitsBetween(base, head, ciBySha)) };
  }
  if (status === "behind") {
    return { kind: "rolls_back", base, ...(await mainCommitsBetween(head, base, ciBySha)) };
  }
  return { kind: "unknown" };
}

/** Excerpts of failed jobs' logs, by job id: a finished job's log never changes (re-runs are new jobs). */
const logExcerpts = new Map<number, LogLine[]>();
/** Only a log's end is read: build logs run to megabytes, the error is near the end. */
const LOG_TAIL_BYTES = 256 * 1024;

async function failureLog(jobId: number): Promise<LogLine[] | null> {
  const cached = logExcerpts.get(jobId);
  if (cached) return cached;
  try {
    // GitHub answers with a redirect to a short-lived download URL, fetched without the token.
    const redirect = await send(`${API}${REPO}/actions/jobs/${jobId}/logs`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await token()}`,
        "user-agent": "coss-dashboard",
        "x-github-api-version": "2026-03-10",
      },
      redirect: "manual",
      cache: "no-store",
    });
    const location = redirect.headers.get("location");
    if (!location) return null;
    const text = await downloadTail(location, LOG_TAIL_BYTES);
    if (text === null) return null;
    const excerpt = failureLogExcerpt(text);
    logExcerpts.set(jobId, excerpt);
    if (logExcerpts.size > 50) logExcerpts.delete(logExcerpts.keys().next().value as number);
    return excerpt;
  } catch (error) {
    console.warn(`[web] Couldn't read the log of deploy job ${jobId}:`, error);
    return null;
  }
}

/**
 * A log's last `max` bytes or so as text, from a line start, downloading only those: the size
 * from a one-byte range, then the range after `size - max` (the store ignores suffix ranges).
 * `null` if the store answers otherwise and the log is too big to read whole.
 */
async function downloadTail(url: string, max: number): Promise<string | null> {
  const get = (range: string) =>
    fetch(url, { headers: { range }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const probe = await get("bytes=0-0");
  const size = Number(/\/(\d+)$/.exec(probe.headers.get("content-range") ?? "")?.[1]);
  if (probe.status === 206 && Number.isFinite(size)) {
    await probe.body?.cancel();
    const start = Math.max(0, size - max);
    const tail = await get(`bytes=${start}-`);
    if (tail.status !== 206 && !(tail.ok && start === 0)) {
      await tail.body?.cancel();
      return null;
    }
    const text = await tail.text();
    return start > 0 ? text.slice(text.indexOf("\n") + 1) : text;
  }
  // No ranges: the whole log came back, read only if small.
  const length = probe.headers.get("content-length");
  if (probe.ok && length !== null && Number(length) <= max) return probe.text();
  await probe.body?.cancel();
  return null;
}
