"use client";

import { rememberFirstTouch } from "@coss/auth/first-touch";
import { useEffect } from "react";

/** Keeps where a visitor first came from, in their browser, for their sign-up on the dashboard. */
export function FirstTouchCapture() {
  useEffect(() => {
    rememberFirstTouch();
  }, []);
  return null;
}
