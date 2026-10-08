// bun test preload, after happydom.ts: jest-dom matchers (toBeInTheDocument, …) and unmounting rendered
// components after each test (Testing Library only does that itself under Jest/Vitest globals).
import { afterEach, expect } from "bun:test";
import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});
