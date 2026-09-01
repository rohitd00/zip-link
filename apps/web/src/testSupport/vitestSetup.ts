// Adds the jest-dom matchers (toBeInTheDocument, toHaveTextContent, etc.)
// to every test file's `expect`. Harmless for backend node-environment
// tests too, since it only extends `expect` and does not touch the DOM.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library normally auto-registers this cleanup itself, but only
// when it detects a global `afterEach` — this project does not enable
// Vitest's `globals` mode (every test file imports afterEach/describe/it
// explicitly instead), so that auto-detection never fires. Without this,
// a component rendered in one test stays in the DOM for the next test in
// the same file, causing "multiple elements found" failures.
afterEach(() => {
  cleanup();
});

// jsdom (the DOM implementation these tests run against) does not yet
// implement HTMLDialogElement's showModal()/close() methods, even though
// every real browser does. This polyfill only patches the test
// environment's DOM, never a real browser, so ConfirmDialog's component
// code can keep using the real native <dialog> API.
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
