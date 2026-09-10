import { useAsync } from "../lib/useAsync";
import { fetchSolvency, type Consortium, type Season, type DetectorFinding } from "../lib/subgraph";
import { formatKg, formatDate, shortHash } from "../lib/format";
import { consortiumLabel, seasonLabel, detectorFindingKind } from "../lib/labels";
import { StatCard } from "./StatCard";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateViews";

function SeasonPanel({ season }: { season: Season }) {
  const findings = [...season.unauthorizedMints, ...season.unauthorizedRetirementOutflows];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold text-[var(--text)]">{seasonLabel(season.id)}</h3>
        <span className="text-sm text-[var(--text-muted)]">Hedera token {season.hederaTokenId}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cap" value={formatKg(season.capGrams)} />
        <StatCard label="Minted" value={formatKg(season.mintedGrams)} tone="accent" />
        <StatCard label="Retired" value={formatKg(season.retiredGrams)} tone="warn" />
        <StatCard label="In circulation" value={formatKg(season.inCirculationGrams)} />
      </div>

      <DetectorFindingsPanel findings={findings} />
    </div>
  );
}

function DetectorFindingsPanel({ findings }: { findings: (DetectorFinding & { __kind?: string })[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3 text-base text-[var(--accent)]">
        No unauthorized mints or retirement outflows detected for this season.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
      <p className="mb-1 text-base font-semibold text-[var(--danger)]">
        {findings.length} detector finding{findings.length === 1 ? "" : "s"}
      </p>
      <p className="mb-3 text-sm text-[var(--text-muted)]">
        The detector flags every Hedera mint with no matching anchor — it doesn't distinguish intent. One below is a deliberate
        demonstration mint made to prove the detector works; the rest are real mints that happened before this season was re-opened on
        the current contract deployment, so they were genuinely never anchored — not attacks, but genuinely caught all the same.
      </p>
      <div className="flex flex-col gap-2">
        {findings.map((f) => {
          const kind = detectorFindingKind(f.hederaTxId);
          return (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/60 px-3 py-2 text-sm">
              <span className="font-mono text-[var(--text)]">{f.hederaTxId}</span>
              {kind === "intentional-demo" && (
                <span className="rounded-full bg-[var(--danger)] px-2 py-0.5 text-xs font-semibold text-white">
                  Intentional demonstration
                </span>
              )}
              {kind === "pre-season-open" && (
                <span className="rounded-full border border-[var(--text-muted)] px-2 py-0.5 text-xs font-semibold text-[var(--text-muted)]">
                  Predates season re-open, real
                </span>
              )}
              <span className="tabular font-semibold text-[var(--danger)]">{formatKg(f.grams)}</span>
              <span className="text-[var(--text-muted)]">{formatDate(f.blockTimestamp)}</span>
              <a
                href={`https://sepolia.etherscan.io/tx/${f.transactionHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline"
              >
                {shortHash(f.transactionHash)}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConsortiumSection({ consortium }: { consortium: Consortium }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold text-[var(--text)]">{consortiumLabel(consortium.id)}</h2>
      {consortium.seasons.length === 0 ? (
        <EmptyBlock title="No seasons yet" detail="This consortium has no seasons opened on-chain." />
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {consortium.seasons.map((s) => (
            <SeasonPanel key={s.id} season={s} />
          ))}
        </div>
      )}
    </section>
  );
}

export function SolvencyView() {
  const state = useAsync(fetchSolvency, []);

  if (state.status === "loading") return <LoadingBlock label="Loading solvency data from the subgraph…" />;
  if (state.status === "error") return <ErrorBlock message={state.error} onRetry={state.reload} />;
  if (state.data.length === 0) {
    return <EmptyBlock title="No consortia yet" detail="No Consortium entities have been indexed by the subgraph yet." />;
  }

  return (
    <div className="flex flex-col gap-8">
      {state.data.map((c) => (
        <ConsortiumSection key={c.id} consortium={c} />
      ))}
    </div>
  );
}
