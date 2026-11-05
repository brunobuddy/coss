import { CALENDAR } from "@/lib/calendar";
import { ogImage } from "@/lib/og";

export const dynamic = "force-static";

export function GET() {
  return ogImage({
    label: CALENDAR.name,
    title: "A React calendar obsessed with micro-perfection.",
    description: "Hand-tuned drag physics, a design mode and a command palette.",
  });
}
