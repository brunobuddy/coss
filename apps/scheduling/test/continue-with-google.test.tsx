import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContinueWithGoogle } from "../src/app/h/[sessionId]/continue-with-google.tsx";

test("the Google button keeps Google's text, colors and four-color logo", () => {
  const html = renderToStaticMarkup(<ContinueWithGoogle onClick={() => {}} />);
  expect(html).toContain("Continue with Google");
  for (const color of ["#747775", "#1F1F1F", "#EA4335", "#4285F4", "#FBBC05", "#34A853"]) {
    expect(html).toContain(color);
  }
});
