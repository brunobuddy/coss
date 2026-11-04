import { type Href, router } from "expo-router";
import { Tabs } from "./tabs";

/**
 * Tabs that are routes (the dashboard's sub-navigation): switching replaces the screen, so Back
 * still returns to where the section was opened from.
 */
export function RouteTabs<T extends string>(props: {
  value: T;
  items: { value: T; label: string; href: Href }[];
}) {
  return (
    <Tabs
      items={props.items}
      onChange={(value) => {
        const item = props.items.find((candidate) => candidate.value === value);
        if (item && value !== props.value) router.replace(item.href);
      }}
      value={props.value}
    />
  );
}
