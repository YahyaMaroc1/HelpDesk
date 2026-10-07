import { useQuery } from "@tanstack/react-query";
import { api, apiErrorMessage } from "../lib/api.ts";
import { authClient } from "../lib/auth-client.ts";

type Health = { status: string; database: string; runtime: string; time: string };

export function HomePage() {
  const { data: session } = authClient.useSession();
  const { data: health, error } = useQuery({
    queryKey: ["health"],
    queryFn: async ({ signal }) => {
      // A 503 still carries a health body (e.g. database unreachable), so only fail on other errors.
      const validateStatus = (status: number) => (status >= 200 && status < 300) || status === 503;
      return (await api.get<Health>("/health", { signal, validateStatus })).data;
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome, {session?.user.name}</h1>
      <div className="text-sm text-gray-600">
        {error && <p className="text-red-700">API unreachable: {apiErrorMessage(error)}</p>}
        {!error && !health && <p>Checking API…</p>}
        {health && (
          <>
            <p>
              API status: <strong>{health.status}</strong> ({health.runtime})
            </p>
            <p className={health.database === "ok" ? undefined : "text-red-700"}>
              Database: <strong>{health.database}</strong>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
