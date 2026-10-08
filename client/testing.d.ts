// Types the jest-dom matchers registered in test-setup.ts on bun:test's `expect`
// (as @testing-library/jest-dom/types/bun.d.ts does, which the package doesn't export).
import type { expect } from "bun:test";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "bun:test" {
  interface Matchers<T = any> extends TestingLibraryMatchers<ReturnType<typeof expect.stringContaining>, T> {}
}
