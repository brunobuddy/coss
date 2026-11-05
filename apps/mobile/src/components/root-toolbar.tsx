import { router, Stack } from "expo-router";
import { useActiveEnvironment } from "../lib/active-environment";
import { useMe } from "../lib/queries";

/** A tab root's native bar: the project and environment on the left, the account on the right. */
export function RootToolbar(props: { environment?: boolean }) {
  const { params, project, organization, select } = useActiveEnvironment();
  const me = useMe();
  const projects = organization?.projects ?? [];
  const current = project?.environments.find((env) => env.slug === params?.env);
  const many = (me.data?.organizations.length ?? 0) > 1;
  return (
    <>
      {props.environment && current ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Menu accessibilityLabel="Project and environment">
            <Stack.Toolbar.Label>{current.name}</Stack.Toolbar.Label>
            {projects.map((item) => (
              <Stack.Toolbar.Menu inline key={item.slug} title={item.name}>
                {item.environments.map((env) => (
                  <Stack.Toolbar.MenuAction
                    isOn={item.slug === params?.project && env.slug === params?.env}
                    key={env.slug}
                    onPress={() => select({ project: item.slug, env: env.slug })}
                  >
                    {env.name}
                  </Stack.Toolbar.MenuAction>
                ))}
              </Stack.Toolbar.Menu>
            ))}
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu accessibilityLabel="Account" icon="person.crop.circle">
          <Stack.Toolbar.MenuAction icon="person" onPress={() => router.push("/settings")}>
            Account
          </Stack.Toolbar.MenuAction>
          {many ? (
            <Stack.Toolbar.MenuAction
              icon="building.2"
              onPress={() => router.push("/organizations")}
            >
              Switch organization
            </Stack.Toolbar.MenuAction>
          ) : null}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}
