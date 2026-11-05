"use client";

import { forgetFirstTouch, recallFirstTouch } from "@coss/auth/first-touch";
import { useEffect } from "react";
import { recordSignupAttributionAction } from "./actions";

/** Reports the first touch once the visitor has an account. Failing here never affects onboarding. */
export function RecordFirstTouch() {
  useEffect(() => {
    const touch = recallFirstTouch();
    if (!touch) return;
    recordSignupAttributionAction(touch).then(
      (result) => {
        if (result.ok) forgetFirstTouch();
      },
      () => {},
    );
  }, []);
  return null;
}
