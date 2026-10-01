import { useEffect, useState } from "react";

type Health = { status: string; database: string; runtime: string; time: string };

export function App() {
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
    <main>
      <h1>HelpDesk</h1>
      {error && <p className="error">API unreachable: {error}</p>}
      {!error && !health && <p>Checking API…</p>}
      {health && (
        <>
          <p>
            API status: <strong>{health.status}</strong> ({health.runtime})
          </p>
          <p className={health.database === "ok" ? undefined : "error"}>
            Database: <strong>{health.database}</strong>
          </p>
        </>
      )}
    </main>
  );
}
