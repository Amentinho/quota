import { useState } from "react";
import { useAsync } from "../lib/useAsync";
import { readSeasonEnsState } from "../lib/ens";
import { KNOWN_SEASONS } from "../lib/constants";
import { formatDateOnly, daysUntil, shortAddr } from "../lib/format";
import { LoadingBlock, ErrorBlock } from "./StateViews";

const TEXT_RECORD_LABELS: Record<string, string> = {
  "quota.unit": "Unit",
  "quota.cap.g": "Cap (g)",
  "quota.token.hedera": "Hedera token",
  "quota.yield.kernel.bp": "Kernel yield (bp)",
  "quota.yield.cream.bp": "Cream yield (bp)",
};

export function SeasonView() {
  const [selectedLabel, setSelectedLabel] = useState(KNOWN_SEASONS[0].label);
  const state = useAsync(() => readSeasonEnsState(selectedLabel), [selectedLabel]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <label htmlFor="season-select" className="text-base font-medium text-[var(--text)]">
          Season
        </label>
        <select
          id="season-select"
          value={selectedLabel}
          onChange={(e) => setSelectedLabel(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
        >
          {KNOWN_SEASONS.map((s) => (
            <option key={s.label} value={s.label}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-[var(--text-muted)]">Read live from Sepolia — not cached, not from the subgraph.</span>
      </div>

      {state.status === "loading" && <LoadingBlock label="Reading ENS state live from Sepolia…" />}
      {state.status === "error" && <ErrorBlock message={state.error} onRetry={state.reload} />}
      {state.status === "ready" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold text-[var(--text)]">{state.data.name}</h2>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  state.data.resolves ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                {state.data.resolves ? "Resolves — mint window open" : "Does not resolve — expired or unregistered"}
              </span>
            </div>
            <p className="mt-3 text-base text-[var(--text-muted)]">
              Resolver <span className="font-mono text-[var(--text)]">{state.data.resolverAddress}</span>
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="mb-2 text-lg font-semibold text-[var(--text)]">Expiry</h3>
            <p className="tabular text-3xl font-bold text-[var(--text)]">{formatDateOnly(state.data.expiry)}</p>
            <p className="mt-1 text-base text-[var(--text-muted)]">
              {daysUntil(state.data.expiry) >= 0
                ? `${daysUntil(state.data.expiry)} days from now — this is the entire mint authorization window, enforced by ENS itself.`
                : `Expired ${Math.abs(daysUntil(state.data.expiry))} days ago.`}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">Text records</h3>
            {Object.keys(state.data.textRecords).length === 0 ? (
              <p className="text-base text-[var(--text-muted)]">No text records set on this resolver for this node.</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {Object.entries(state.data.textRecords).map(([key, value]) => (
                  <div key={key} className="flex justify-between border-b border-[var(--border)] pb-2">
                    <dt className="text-base text-[var(--text-muted)]">{TEXT_RECORD_LABELS[key] ?? key}</dt>
                    <dd className="tabular text-base font-semibold text-[var(--text)]">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text)]">Current MINTER role holders</h3>
            {state.data.minterHolders.length === 0 ? (
              <p className="text-base text-[var(--text-muted)]">
                No account currently holds MINTER on this season — either none was ever granted, it was revoked, or the season has expired
                (role checks are expiry-gated too).
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {state.data.minterHolders.map((addr) => (
                  <li key={addr} className="flex items-center gap-2 rounded-md bg-[var(--accent-soft)] px-3 py-2">
                    <span className="tabular font-mono text-base text-[var(--text)]" title={addr}>
                      {shortAddr(addr)}
                    </span>
                    <span className="text-sm text-[var(--accent)]">holds MINTER</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
