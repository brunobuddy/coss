// iOS 27 asserts at launch unless the app adopts the scene-based life cycle, and SDK 57's prebuild
// template still starts React Native from the app delegate. This plugin moves the start into
// Expo's own `ExpoAppSceneDelegate` (Objective-C name `EXExpoAppSceneDelegate`, so Info.plist can
// name it without adding a Swift file): the app delegate keeps creating the factory and hands it
// over through `ExpoReactNativeFactoryProvider`.
const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");

const WINDOW_START =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n/;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-delegate: expected a Swift AppDelegate");
    }
    let src = mod.modResults.contents;
    if (!src.includes("ExpoReactNativeFactoryProvider")) {
      src = src.replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      );
    }
    // the scene delegate creates the window and starts React Native into it
    src = src.replace(WINDOW_START, "\n");
    if (!src.includes("ExpoReactNativeFactoryProvider") || src.includes("UIScreen.main.bounds")) {
      throw new Error("with-scene-delegate: the AppDelegate template changed; update the plugin");
    }
    mod.modResults.contents = src;
    return mod;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
}

module.exports = (config) => withSceneManifest(withSceneAppDelegate(config));
