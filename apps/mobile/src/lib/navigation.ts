import { fonts, type usePalette } from "./theme";

/** Every stack's bar: system glass, the display face, and the screen's own title. */
export function stackOptions(palette: ReturnType<typeof usePalette>) {
  return {
    title: "",
    headerShadowVisible: false,
    headerBackButtonDisplayMode: "minimal" as const,
    headerTintColor: palette.foreground,
    headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17, color: palette.foreground },
    headerLargeTitleStyle: { fontFamily: fonts.display, color: palette.foreground },
    contentStyle: { backgroundColor: palette.background },
  };
}
