# expo-kloq example

A development build (not Expo Go: `@expo/ui` and `expo-glass-effect` are native modules) that shows
`<KloqCalendar>` from `packages/expo-kloq` with four seeded calendars and a few weeks of events placed
relative to today.

```sh
bun install                                             # repo root
bun run --cwd apps/expo-kloq-example prebuild -- -p ios # writes ios/ from app.json + plugins/
bun run --cwd apps/expo-kloq-example ios                # build, install, start Metro
```

`ios/` and `android/` are generated (Continuous Native Generation): change `app.json` or
`plugins/` and prebuild again, never edit them. If `pod install` fails with a Unicode
normalization error, run it with `LANG=en_US.UTF-8`.

- **iOS 27** asserts at launch unless the app uses the scene life cycle, which SDK 57's prebuild
  template doesn't. `plugins/with-scene-delegate.js` makes the AppDelegate an
  `ExpoReactNativeFactoryProvider` and points `UIApplicationSceneManifest` at Expo's
  `ExpoAppSceneDelegate`, which starts React Native in the scene's window.
- **Metro** (`metro.config.js`) pins React, React Native and the native modules' JS to this app, so
  kloq's sources (whose workspace has the web apps' React) share one React.
- **Demo**: `maestro/demo.yaml` walks every interaction. Run it on a Release build
  (`bunx expo run:ios --configuration Release`): a debug build's dev-client button covers the
  sheets' Save button.
