// bun test preload: a DOM (window, document, …) for component tests. It runs before test-setup.ts, because
// Testing Library binds `screen` to document.body when it's first imported.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
