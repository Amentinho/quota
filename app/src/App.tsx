import { useState } from "react";
import { SolvencyView } from "./components/SolvencyView";
import { ChainView } from "./components/ChainView";
import { SeasonView } from "./components/SeasonView";

const TABS = [
  { id: "solvency", label: "Solvency" },
  { id: "chain", label: "Chain" },
  { id: "season", label: "Season" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function App() {
  const [tab, setTab] = useState<TabId>("solvency");

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]">QUOTA</h1>
            <p className="mt-1 text-base text-[var(--text-muted)]">
              Live solvency, chain-of-custody, and policy views for Bronte PDO pistachio — read directly from a Sepolia subgraph and ENS,
              no backend.
            </p>
          </div>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-4 py-2 text-base font-semibold transition-colors ${
                  tab === t.id
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {tab === "solvency" && <SolvencyView />}
        {tab === "chain" && <ChainView />}
        {tab === "season" && <SeasonView />}
      </main>
    </div>
  );
}

export default App;
