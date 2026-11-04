import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isWebLink, Where } from "../src/components/where.tsx";

const render = (url: string) => renderToStaticMarkup(<Where location={{ type: "link", url }} />);

test("a stored link only becomes a link if it's on the web", () => {
  expect(isWebLink("https://video.example/room")).toBe(true);
  // Older bookings can hold one: new links must be https, but these still have to open.
  expect(isWebLink("http://video.example/room")).toBe(true);
  expect(isWebLink("javascript:alert(1)")).toBe(false);
  expect(isWebLink("JaVaScRiPt:alert(1)")).toBe(false);
  expect(isWebLink("data:text/html,hi")).toBe(false);
  expect(isWebLink("not a url")).toBe(false);
});

test("a booking holding a javascript: link shows nothing to click", () => {
  expect(render("https://video.example/room")).toContain('href="https://video.example/room"');
  expect(render("javascript:alert(1)")).toBe("");
});
