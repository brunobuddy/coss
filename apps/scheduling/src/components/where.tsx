import { MapPinIcon, PhoneIcon, VideoIcon } from "lucide-react";
import { Detail } from "@/components/page";

export type BookingLocation = {
  type: string;
  url?: string | null;
  number?: string | null;
  address?: string | null;
} | null;

/** New links must be https, but a booking can hold an older one: never put anything else in an `href`. */
export function isWebLink(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Where a booking happens, once there's something to say: a link can still be on its way. */
export function Where({ location }: { location: BookingLocation }) {
  if (!location) return null;
  if (location.url) {
    if (!isWebLink(location.url)) return null;
    return (
      <Detail icon={VideoIcon} label="Where">
        <a
          className="underline underline-offset-3"
          href={location.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          Join the meeting
        </a>
      </Detail>
    );
  }
  if (location.number) {
    return (
      <Detail icon={PhoneIcon} label="Where">
        <a className="underline underline-offset-3" href={`tel:${location.number}`}>
          {location.number}
        </a>
      </Detail>
    );
  }
  if (location.address) {
    return (
      <Detail icon={MapPinIcon} label="Where">
        {location.address}
      </Detail>
    );
  }
  return null;
}
