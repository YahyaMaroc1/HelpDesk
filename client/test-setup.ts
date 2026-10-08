// bun test preload, after happydom.ts: jest-dom matchers (toBeInTheDocument, …) and unmounting rendered
// components after each test (Testing Library only does that itself under Jest/Vitest globals).
import { afterEach, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// Base UI popups (Dialog, …) wait for exit animations before unmounting, and happy-dom never finishes
// them, so a closed dialog would stay in the DOM. This is Base UI's switch for skipping that wait.
(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;

afterEach(() => {
  cleanup();
});
