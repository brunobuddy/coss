# AGENTS.md — `packages/expo-kloq` (kloq for Expo)

kloq's calendar for React Native: the same model as `packages/kloq` (store, projection, month/year/agenda
layout, recurrence and its "this / following / all" plans, RRULE presets, quick add, reminders, time
zones, timeline window), drawn with native controls — SwiftUI through `@expo/ui/swift-ui` on iOS (Liquid
Glass on iOS 26+, through `expo-glass-effect`), Jetpack Compose through `@expo/ui/jetpack-compose` on
Android. MIT like kloq. The runnable example is `apps/expo-kloq-example`.

## Rules

- **Never copy kloq's logic.** Everything calendar-shaped is imported from kloq's model modules, only
  through `src/model.ts` (the one seam), only from `kloq/lib/*` (kloq's root entry pulls in its DOM
  components). If something is missing, export it from kloq rather than re-implementing it here.
- kloq's `calendar-store`/`calendar-sources` import `react`: a Metro bundle must resolve that to the
  app's React Native React, not the web apps' catalog React — the example's `metro.config.js` pins
  `react`, `react-native`, `expo`, `@expo/ui`, `expo-glass-effect` and the safe-area package to the app.
  Hosts in other monorepos need the same.
- Native controls live in `src/native/*.ios.tsx` and `*.android.tsx`; the extensionless `*.tsx` next to
  them re-exports the iOS file and is only what TypeScript resolves (both platforms implement the props
  in `src/native/types.ts`). Import them **extensionless** (`../native/controls`), or Metro's platform
  resolution is bypassed. Everything else uses explicit `.ts`/`.tsx` imports.
- `@expo/ui` components render only inside a `Host`; a `Form` needs a sized host
  (`style={{ flex: 1 }}` + `useViewportSizeMeasurement`), small controls `matchContents`.
- Containers that hold tappable children (day columns, month cells, timeline lanes) are
  `accessible={false}`, or VoiceOver and Maestro see one element and none of the events inside.
- Biome reads `role` on `@expo/ui`'s `Button` as ARIA: `useValidAriaRole` is off here (`biome.jsonc`).

## Layout

- `use-kloq.ts`: the controller (kloq's `InternalStore`, the calendar source registry, view + anchor,
  save/remove through `editOccurrence`/`deleteOccurrence` + `applyPlan` with an injected scope asker).
- `calendar.tsx`: `<KloqCalendar>` — toolbar (`NavControls`: glass buttons + a SwiftUI `Menu`), the
  segmented `ViewSwitcher`, the active view, the floating glass New event / Quick add bar, the sheets.
- `views/`: `TimeGrid` (day, 3 days, week; multi-zone gutter; opens at 8 AM), `MonthView`, `AgendaView`,
  `YearView`, `TimelineView` (one lane per visible calendar). Plain React Native views over kloq's layout.
- `sheets/`: native page sheets (`Modal` `pageSheet`) with the actions pinned above a native form —
  `EventSheet` (+ the scope dialog), `QuickAddSheet`, `SettingsSheet`.
- `editor/draft.ts`: event ⇄ form state (inclusive all-day ends, custom RRULE builder fields).

## Checks

`bun run --cwd packages/expo-kloq typecheck` (TS 7; `noUncheckedIndexedAccess` off because kloq's
sources are type-checked through the imports). There are no unit tests yet: kloq's own model is
tested upstream (`cosscom/calendar`); this package is verified on the Simulator with
`apps/expo-kloq-example/maestro/demo.yaml`. Android is type-checked but not yet run.
