import { describe, expect, test } from "bun:test";
import { newId } from "@coss/db/id";
import {
  createFirstProject,
  createProject,
  FIRST_PROJECT_NAME,
  getEnvironment,
  getEnvironmentById,
  getProject,
  listEnvironments,
  listProjects,
  listProjectsWithEnvironments,
  renameProject,
  TenancyError,
} from "../src/index.ts";
import { createTestOrganization } from "./helpers.ts";

describe("createFirstProject", () => {
  test("starts an organization with a project and its two environments", async () => {
    const { organization } = await createTestOrganization();
    const created = await createFirstProject({ organizationId: organization.id });

    expect(created?.project.name).toBe(FIRST_PROJECT_NAME);
    expect(created?.environments.map((environment) => environment.mode).sort()).toEqual([
      "live",
      "sandbox",
    ]);
  });

  test("does nothing once the organization has a project", async () => {
    const { organization } = await createTestOrganization();
    await createProject({ organizationId: organization.id, name: "Web app" });

    expect(await createFirstProject({ organizationId: organization.id })).toBeNull();
    const projects = await listProjects({ organizationId: organization.id });
    expect(projects.map((project) => project.name)).toEqual(["Web app"]);
  });
});

describe("createProject", () => {
  test("never takes a slug the organization's own pages use", async () => {
    const { organization } = await createTestOrganization();
    const { project } = await createProject({ organizationId: organization.id, name: "Settings" });
    expect(project.slug).toBe("settings-2");
  });

  test("creates production (live) and development (sandbox) environments", async () => {
    const { organization } = await createTestOrganization();
    const { project, environments } = await createProject({
      organizationId: organization.id,
      name: "  My App  ",
    });

    expect(project).toMatchObject({
      organizationId: organization.id,
      name: "My App",
      slug: "my-app",
    });
    expect(project.id).toStartWith("proj_");
    expect(environments.map((env) => [env.name, env.slug, env.mode])).toEqual([
      ["Production", "production", "live"],
      ["Development", "development", "sandbox"],
    ]);
    for (const env of environments) {
      expect(env.id).toStartWith("env_");
      expect(env.organizationId).toBe(organization.id);
      expect(env.projectId).toBe(project.id);
    }
  });

  test("suffixes duplicate slugs, also under concurrency", async () => {
    const { organization } = await createTestOrganization();
    const create = () => createProject({ organizationId: organization.id, name: "Web Site" });

    expect((await create()).project.slug).toBe("web-site");
    expect((await create()).project.slug).toBe("web-site-2");

    const concurrent = await Promise.all([create(), create(), create()]);
    expect(concurrent.map((r) => r.project.slug).sort()).toEqual([
      "web-site-3",
      "web-site-4",
      "web-site-5",
    ]);
  });

  test("falls back to `project` when the name has no slug characters", async () => {
    const { organization } = await createTestOrganization();
    const { project } = await createProject({ organizationId: organization.id, name: "!!!" });
    expect(project.slug).toBe("project");
  });

  test("rejects blank and overlong names", async () => {
    const { organization } = await createTestOrganization();
    for (const name of ["   ", "x".repeat(65)]) {
      const error = await createProject({ organizationId: organization.id, name }).catch((e) => e);
      expect(error).toBeInstanceOf(TenancyError);
      expect(error.code).toBe("invalid");
    }
  });

  test("unknown organization is not_found", async () => {
    const error = await createProject({ organizationId: newId("org"), name: "Ghost" }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(TenancyError);
    expect(error.code).toBe("not_found");
  });
});

describe("renameProject", () => {
  test("changes the name only: the slug and environments stay", async () => {
    const { organization } = await createTestOrganization();
    const { project, environments } = await createProject({
      organizationId: organization.id,
      name: "Web App",
    });

    const result = await renameProject({
      organizationId: organization.id,
      projectId: project.id,
      name: "  Storefront  ",
    });
    expect(result.previous.name).toBe("Web App");
    expect(result.project).toMatchObject({ id: project.id, name: "Storefront", slug: "web-app" });
    expect(await getProject({ organizationId: organization.id, slug: "web-app" })).toEqual(
      result.project,
    );
    expect(
      await listEnvironments({ organizationId: organization.id, projectId: project.id }),
    ).toEqual(environments);
  });

  test("the same name changes nothing", async () => {
    const { organization } = await createTestOrganization();
    const { project } = await createProject({ organizationId: organization.id, name: "Same" });
    const result = await renameProject({
      organizationId: organization.id,
      projectId: project.id,
      name: "Same",
    });
    expect(result).toEqual({ previous: project, project });
  });

  test("rejects blank and overlong names", async () => {
    const { organization } = await createTestOrganization();
    const { project } = await createProject({ organizationId: organization.id, name: "Kept" });
    for (const name of ["   ", "x".repeat(65)]) {
      const error = await renameProject({
        organizationId: organization.id,
        projectId: project.id,
        name,
      }).catch((e) => e);
      expect(error).toBeInstanceOf(TenancyError);
      expect(error.code).toBe("invalid");
    }
    expect((await getProject({ organizationId: organization.id, slug: "kept" }))?.name).toBe(
      "Kept",
    );
  });

  test("another organization's project is not_found and unchanged", async () => {
    const a = await createTestOrganization();
    const b = await createTestOrganization();
    const { project } = await createProject({ organizationId: a.organization.id, name: "Mine" });

    const error = await renameProject({
      organizationId: b.organization.id,
      projectId: project.id,
      name: "Theirs",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(TenancyError);
    expect(error.code).toBe("not_found");
    expect((await getProject({ organizationId: a.organization.id, slug: "mine" }))?.name).toBe(
      "Mine",
    );
  });
});

describe("project and environment reads are organization-scoped", () => {
  test("listProjects / getProject", async () => {
    const a = await createTestOrganization();
    const b = await createTestOrganization();
    const first = await createProject({ organizationId: a.organization.id, name: "First" });
    const second = await createProject({ organizationId: a.organization.id, name: "Second" });

    const listed = await listProjects({ organizationId: a.organization.id });
    expect(listed.map((p) => p.id)).toEqual([first.project.id, second.project.id]);
    expect(await listProjects({ organizationId: b.organization.id })).toEqual([]);

    expect(await getProject({ organizationId: a.organization.id, slug: "first" })).toEqual(
      first.project,
    );
    expect(await getProject({ organizationId: b.organization.id, slug: "first" })).toBeNull();
    expect(await getProject({ organizationId: a.organization.id, slug: "missing" })).toBeNull();
  });

  test("listProjectsWithEnvironments", async () => {
    const a = await createTestOrganization();
    const b = await createTestOrganization();
    const first = await createProject({ organizationId: a.organization.id, name: "First" });
    const second = await createProject({ organizationId: a.organization.id, name: "Second" });

    const listed = await listProjectsWithEnvironments({ organizationId: a.organization.id });
    expect(
      listed.map(({ project, environments }) => [project.id, environments.map((e) => e.slug)]),
    ).toEqual([
      [first.project.id, ["production", "development"]],
      [second.project.id, ["production", "development"]],
    ]);
    expect(await listProjectsWithEnvironments({ organizationId: b.organization.id })).toEqual([]);
  });

  test("listEnvironments / getEnvironment / getEnvironmentById", async () => {
    const a = await createTestOrganization();
    const b = await createTestOrganization();
    const { project, environments } = await createProject({
      organizationId: a.organization.id,
      name: "Scoped",
    });
    const [production, development] = environments;
    if (!production || !development) throw new Error("missing environments");

    const listed = await listEnvironments({
      organizationId: a.organization.id,
      projectId: project.id,
    });
    expect(listed.map((env) => env.slug)).toEqual(["production", "development"]);
    expect(
      await listEnvironments({ organizationId: b.organization.id, projectId: project.id }),
    ).toEqual([]);

    expect(
      await getEnvironment({
        organizationId: a.organization.id,
        projectSlug: "scoped",
        envSlug: "development",
      }),
    ).toEqual({ project, environment: development });
    expect(
      await getEnvironment({
        organizationId: b.organization.id,
        projectSlug: "scoped",
        envSlug: "development",
      }),
    ).toBeNull();
    expect(
      await getEnvironment({
        organizationId: a.organization.id,
        projectSlug: "scoped",
        envSlug: "staging",
      }),
    ).toBeNull();

    expect(
      await getEnvironmentById({ organizationId: a.organization.id, environmentId: production.id }),
    ).toEqual(production);
    expect(
      await getEnvironmentById({ organizationId: b.organization.id, environmentId: production.id }),
    ).toBeNull();
  });
});
