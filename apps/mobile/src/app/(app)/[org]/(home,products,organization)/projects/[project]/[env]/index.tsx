import { useLocalSearchParams } from "expo-router";
import { EnvironmentHome } from "../../../../../../../components/environment-home";
import type { EnvironmentParams } from "../../../../../../../lib/web";

export default function EnvironmentScreen() {
  const params = useLocalSearchParams<EnvironmentParams>();
  return <EnvironmentHome params={params} />;
}
