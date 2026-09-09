import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useAsync } from "../lib/useAsync";
import { fetchSolvency, type Consortium, type Season, type DetectorFinding } from "../lib/subgraph";
import { formatKg, formatPercent, formatDate, shortHash, gramsToKg } from "../lib/format";
import { consortiumLabel, seasonLabel } from "../lib/labels";
import { StatCard } from "./StatCard";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateViews";

// A single proportional bar of the season's cap, not a grouped chart of
// four independent values -- at real harvest scale (a 3,400-tonne cap
// against a handful of demonstration grams) four same-scale bars would
// render three of them as invisible slivers. A stacked share of the cap
// stays legible and honest at any ratio, including this one.
function UtilizationBar({ season }: { season: Season }) {
  const capKg = gramsToKg(season.capGrams);
  const retiredKg = gramsToKg(season.retiredGrams);
  const inCirculationKg = gramsToKg(season.inCirculationGrams);
  const headroomKg = Math.max(capKg - retiredKg - inCirculationKg, 0);

  const data = [{ name: "cap", retired: retiredKg, inCirculation: inCirculationKg, headroom: headroomKg }];

  return (
    <div className="h-20 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <XAxis
            type="number"
            domain={[0, capKg]}
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toLocaleString()} kg`}
          />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(v, name) => [`${Number(v).toLocaleString()} kg`, name]}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
          />
          <Bar dataKey="retired" stackId="a" fill="var(--warn)" name="Retired" barSize={28} />
          <Bar dataKey="inCirculation" stackId="a" fill="var(--accent)" name="In circulation" barSize={28} />
          <Bar dataKey="headroom" stackId="a" fill="var(--border)" name="Unminted headroom" radius={[0, 6, 6, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-1 flex gap-4 text-sm text-[var(--text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warn)" }} /> Retired
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} /> In circulation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--border)" }} /> Unminted headroom
        </span>
      </div>
    </div>
  );
}

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
        <StatCard
          label="In circulation"
          value={formatKg(season.inCirculationGrams)}
          sub={`${formatPercent(season.utilisationBp)} of cap minted`}
        />
      </div>

      <UtilizationBar season={season} />

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
      <p className="mb-2 text-base font-semibold text-[var(--danger)]">
        {findings.length} detector finding{findings.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-col gap-2">
        {findings.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white/60 px-3 py-2 text-sm">
            <span className="font-mono text-[var(--text)]">{f.hederaTxId}</span>
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
        ))}
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
