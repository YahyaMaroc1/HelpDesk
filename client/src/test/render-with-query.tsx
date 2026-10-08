import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/query-client.ts";

// Renders `ui` inside the app's real QueryClient, as main.tsx does. Call `queryClient.clear()` after each test
// so cached data doesn't leak between tests.
export function renderWithQuery(ui: ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
