import { useEffect, useState } from "react";
import { authClient } from "../lib/auth-client.ts";

type Health = { status: string; database: string; runtime: string; time: string };

export function HomePage() {
  const { data: session } = authClient.useSession();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (res) => {
        // A 503 still carries a health body (e.g. database unreachable), so only fail on other errors.
        if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Health;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Welcome, {session?.user.name}</h1>
      <div className="text-sm text-gray-600">
        {error && <p className="text-red-700">API unreachable: {error}</p>}
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
