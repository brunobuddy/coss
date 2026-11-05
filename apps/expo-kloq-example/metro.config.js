// Bun's isolated linker gives every workspace its own `node_modules`, so `kloq`'s sources would
// resolve `react` to the web apps' React (the root catalog's) and `expo-kloq` to its own dev copy.
// A React Native bundle must hold exactly one React and one copy of each native module's JS, so
// these packages always resolve from this app, whoever imports them.
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const SINGLETONS = [
  "react",
  "react-native",
  "expo",
  "@expo/ui",
  "expo-glass-effect",
  "react-native-safe-area-context",
];
const appOrigin = path.join(__dirname, "index.ts");

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  const singleton = SINGLETONS.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  );
  if (singleton && context.originModulePath !== appOrigin) {
    return resolve({ ...context, originModulePath: appOrigin }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
