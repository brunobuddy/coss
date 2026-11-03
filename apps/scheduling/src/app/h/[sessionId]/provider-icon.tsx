import { CalendarIcon, FlaskConicalIcon } from "lucide-react";

export const PROVIDER_NAMES = {
  google: "Google Calendar",
  microsoft: "Microsoft Outlook",
  caldav: "Apple or CalDAV",
  simulated: "Test calendar",
  zoom: "Zoom",
} as const;

export type Provider = keyof typeof PROVIDER_NAMES;

export function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg aria-hidden="true" className="size-5" viewBox="0 0 48 48">
        <path
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          fill="#EA4335"
        />
        <path
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          fill="#4285F4"
        />
        <path
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          fill="#FBBC05"
        />
        <path
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          fill="#34A853"
        />
      </svg>
    );
  }
  if (provider === "microsoft") {
    return (
      <svg aria-hidden="true" className="size-5" viewBox="0 0 21 21">
        <path d="M1 1h9v9H1z" fill="#F25022" />
        <path d="M11 1h9v9h-9z" fill="#7FBA00" />
        <path d="M1 11h9v9H1z" fill="#00A4EF" />
        <path d="M11 11h9v9h-9z" fill="#FFB900" />
      </svg>
    );
  }
  if (provider === "zoom") {
    return (
      <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
        <rect fill="#0B5CFF" height="24" rx="6" width="24" />
        <path
          d="M5 8.8c0-.6.5-1 1-1h6.3c1.4 0 2.5 1.100 2.500 2.500v4.900c0 .6-.5 1-1 1H7.500A2.500 2.500 0 0 1 5 13.700zm11 2 2.500-2c.5-.4 1.500-.2 1.500.6v5.200c0 .8-1 1-1.500.6l-2.500-2z"
          fill="#fff"
        />
      </svg>
    );
  }
  if (provider === "simulated") {
    return <FlaskConicalIcon aria-hidden="true" className="size-5 text-muted-foreground" />;
  }
  return <CalendarIcon aria-hidden="true" className="size-5 text-muted-foreground" />;
}
