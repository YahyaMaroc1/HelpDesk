import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Same origin as the API (the dev server proxies /api), so the default base URL /api/auth works.
export const authClient = createAuthClient({
  plugins: [
    // Mirrors the `role` additionalField in server/src/lib/auth.ts so it is typed on the session user.
    inferAdditionalFields({ user: { role: { type: "string", input: false } } }),
  ],
});
