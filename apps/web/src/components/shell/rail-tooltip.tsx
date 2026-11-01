"use client";

import { useSidebar } from "@coss/ui/components/sidebar";
import {
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
} from "@coss/ui/components/tooltip";
import { type ComponentProps, createContext, type ReactNode, useContext, useState } from "react";

type Payload = { label: string };
type Handle = ReturnType<typeof TooltipCreateHandle<Payload>>;

const RailTooltipContext = createContext<Handle | null>(null);

/**
 * One tooltip for the whole rail: moving from icon to icon slides it to the next one and
 * crossfades the label (coss ui's tooltip animates between triggers that share a handle).
 */
export function RailTooltip(props: { children: ReactNode }) {
  const { isMobile } = useSidebar();
  const [handle] = useState(() => TooltipCreateHandle<Payload>());
  return (
    <RailTooltipContext.Provider value={handle}>
      {props.children}
      {isMobile ? null : (
        <Tooltip handle={handle}>
          {({ payload }) => (
            <TooltipPopup align="center" side="right" sideOffset={8}>
              {payload?.label}
            </TooltipPopup>
          )}
        </Tooltip>
      )}
    </RailTooltipContext.Provider>
  );
}

/** A rail control labelled by the shared tooltip; `render` is the control itself. */
export function RailTooltipTrigger({
  label,
  ...props
}: Omit<ComponentProps<typeof TooltipTrigger>, "handle" | "payload"> & { label: string }) {
  const handle = useContext(RailTooltipContext);
  if (!handle) throw new Error("RailTooltipTrigger needs a RailTooltip around it.");
  return <TooltipTrigger delay={300} {...props} handle={handle} payload={{ label }} />;
}
