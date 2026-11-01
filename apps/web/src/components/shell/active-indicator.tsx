"use client";

import { cn } from "@coss/ui/lib/utils";
import { type RefObject, useEffect, useLayoutEffect, useState } from "react";

type IndicatorRect = { top: number; left: number; width: number; height: number };

const ACTIVE = '[data-sidebar="menu-button"][data-active="true"]';

/**
 * Where the active sidebar button sits inside `container`, for a highlight that slides between
 * buttons, as in the docs' sidebar (`apps/site/src/lib/use-active-indicator.ts`). Measured again
 * when `key` (the pathname) changes and on resizes; `animate` turns on after the first placement,
 * so the highlight appears in place and only slides when the active button changes.
 */
export function useActiveIndicator(
  container: RefObject<HTMLElement | null>,
  key: string,
  selector: string = ACTIVE,
) {
  const [rect, setRect] = useState<IndicatorRect | null>(null);
  const [animate, setAnimate] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` is when the active button moves.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return setRect(null);
    const measure = () => {
      const button = root.querySelector<HTMLElement>(selector);
      if (!button || button.getClientRects().length === 0) return setRect(null);
      const outer = root.getBoundingClientRect();
      const inner = button.getBoundingClientRect();
      const next = {
        top: inner.top - outer.top + root.scrollTop,
        left: inner.left - outer.left + root.scrollLeft,
        width: inner.width,
        height: inner.height,
      };
      setRect((current) => (current && sameRect(current, next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const child of root.children) {
      if (child.getAttribute("aria-hidden") !== "true") observer.observe(child);
    }
    return () => observer.disconnect();
  }, [container, key, selector]);

  useEffect(() => {
    if (!rect) return setAnimate(false);
    if (animate) return;
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, [rect, animate]);

  return { rect, animate };
}

function sameRect(a: IndicatorRect, b: IndicatorRect): boolean {
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

/** The sliding highlight, drawn behind the buttons of a `relative` container. */
export function ActiveIndicator(
  props: ReturnType<typeof useActiveIndicator> & { className?: string },
) {
  if (!props.rect) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 rounded-lg bg-sidebar-accent shadow-[0_1px_2px_--theme(--color-black/6%)] inset-shadow-[0_1px_--theme(--color-white/55%)] motion-reduce:transition-none dark:inset-shadow-[0_1px_--theme(--color-white/6%)]",
        props.animate &&
          "transition-[translate,width,height,background-color] duration-200 ease-out",
        props.className,
      )}
      style={{
        translate: `${props.rect.left}px ${props.rect.top}px`,
        width: props.rect.width,
        height: props.rect.height,
      }}
    />
  );
}
