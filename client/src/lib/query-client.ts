import { QueryClient } from "@tanstack/react-query";
import axios from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The default (3 retries, 1s/2s/4s) holds back the error for ~7 s. Client errors (401, 403, 404, …)
      // won't change on retry, so fail at once; retry server and network errors once.
      retry: (failureCount, error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        if (status !== undefined && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
