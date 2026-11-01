import { SettingsTitle } from "./settings-title";

/** Organization settings: the sidebar's panel lists the pages; the plain ones get their title here. */
export default function OrganizationSettingsLayout({
  children,
}: LayoutProps<"/[orgSlug]/settings">) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsTitle />
      {children}
    </div>
  );
}
