import { EnvironmentHome } from "../../../../components/environment-home";
import { useActiveEnvironment } from "../../../../lib/active-environment";

export default function HomeScreen() {
  const { params, isPending } = useActiveEnvironment();
  return <EnvironmentHome params={params} pending={isPending} root />;
}
