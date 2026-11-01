import type { ReactNode } from "react";

/** Mounted again on every navigation, so each page arrives with the same short rise. */
export default function OrganizationTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col gap-6">{children}</div>;
}
