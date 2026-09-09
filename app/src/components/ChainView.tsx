import { useEffect, useState } from "react";
import { useAsync } from "../lib/useAsync";
import { fetchKnownLotRefs, fetchLotJourney, fetchSeasonTransfers, type Lot, type SeasonTransfer } from "../lib/subgraph";
import { formatKg, formatDate, formatBp, shortAddr, shortHash } from "../lib/format";
import { seasonLabel } from "../lib/labels";
import { LoadingBlock, ErrorBlock, EmptyBlock } from "./StateViews";

type TimelineStep =
  | { kind: "mint"; timestamp: string; seasonId: string; grams: string; hederaTxId: string; transactionHash: string }
  | { kind: "transfer"; timestamp: string; seasonId: string; grams: string; from: string; to: string; transactionHash: string }
  | {
      kind: "transform";
      timestamp: string;
      inputGrams: string;
      outputGrams: string;
      productType: string;
      yieldBp: string;
      transactionHash: string;
    }
  | { kind: "retirement"; timestamp: string; seasonId: string; grams: string; hederaTxId: string; transactionHash: string };

function buildTimeline(lots: Lot[], transfersBySeasonId: Record<string, SeasonTransfer[]>): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const seenTransforms = new Set<string>();

  for (const lot of lots) {
    for (const m of lot.mints) {
      steps.push({
        kind: "mint",
        timestamp: m.blockTimestamp,
        seasonId: lot.season.id,
        grams: m.grams,
        hederaTxId: m.hederaTxId,
        transactionHash: m.transactionHash,
      });
    }
    for (const r of lot.retirements) {
      steps.push({
        kind: "retirement",
        timestamp: r.blockTimestamp,
        seasonId: lot.season.id,
        grams: r.grams,
        hederaTxId: r.hederaTxId,
        transactionHash: r.transactionHash,
      });
    }
    for (const t of [...lot.transformationsAsInput, ...lot.transformationsAsOutput]) {
      if (seenTransforms.has(t.transactionHash)) continue;
      seenTransforms.add(t.transactionHash);
      steps.push({
        kind: "transform",
        timestamp: t.blockTimestamp,
        inputGrams: t.inputGrams,
        outputGrams: t.outputGrams,
        productType: t.productType,
        yieldBp: t.yieldBp,
        transactionHash: t.transactionHash,
      });
    }
    for (const tr of transfersBySeasonId[lot.season.id] ?? []) {
      steps.push({
        kind: "transfer",
        timestamp: tr.blockTimestamp,
        seasonId: lot.season.id,
        grams: tr.grams,
        from: tr.from,
        to: tr.to,
        transactionHash: tr.transactionHash,
      });
    }
  }

  return steps.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
}

function StepCard({ step }: { step: TimelineStep }) {
  const base = "flex flex-col gap-1 rounded-lg border p-4";
  if (step.kind === "mint") {
    return (
      <div className={`${base} border-[var(--accent)] bg-[var(--accent-soft)]`}>
        <span className="text-sm font-semibold uppercase tracking-wide text-[var(--accent)]">Mint — {seasonLabel(step.seasonId)}</span>
        <span className="tabular text-2xl font-bold text-[var(--text)]">{formatKg(step.grams)}</span>
        <span className="text-sm text-[var(--text-muted)]">Hedera {step.hederaTxId}</span>
        <TxLink hash={step.transactionHash} />
      </div>
    );
  }
  if (step.kind === "transfer") {
    return (
      <div className={`${base} border-[var(--border)] bg-[var(--surface)]`}>
        <span className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Transfer — {seasonLabel(step.seasonId)}
        </span>
        <span className="tabular text-2xl font-bold text-[var(--text)]">{formatKg(step.grams)}</span>
        <span className="text-sm text-[var(--text-muted)]">
          {shortAddr(step.from)} → {shortAddr(step.to)}
        </span>
        <span className="text-xs text-[var(--text-muted)]">Season-level custody transfer, not lot-attributed at the contract level.</span>
        <TxLink hash={step.transactionHash} />
      </div>
    );
  }
  if (step.kind === "transform") {
    return (
      <div className={`${base} border-[var(--warn)] bg-[var(--warn-soft)]`}>
        <span className="text-sm font-semibold uppercase tracking-wide text-[var(--warn)]">
          Transformation — {step.productType}
        </span>
        <div className="flex items-baseline gap-3">
          <span className="tabular text-2xl font-bold text-[var(--text)]">{formatKg(step.inputGrams)}</span>
          <span className="text-[var(--text-muted)]">→</span>
          <span className="tabular text-2xl font-bold text-[var(--text)]">{formatKg(step.outputGrams)}</span>
        </div>
        <span className="text-sm text-[var(--text-muted)]">Yield ratio enforced on-chain, read live from ENS: {formatBp(step.yieldBp)}</span>
        <TxLink hash={step.transactionHash} />
      </div>
    );
  }
  return (
    <div className={`${base} border-[var(--text-muted)] bg-white`}>
      <span className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Retirement — {seasonLabel(step.seasonId)}
      </span>
      <span className="tabular text-2xl font-bold text-[var(--text)]">{formatKg(step.grams)}</span>
      <span className="text-sm text-[var(--text-muted)]">Hedera {step.hederaTxId}</span>
      <TxLink hash={step.transactionHash} />
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)] underline">
      {shortHash(hash)} on Etherscan
    </a>
  );
}

async function loadLotView(lotRef: string) {
  const lots = await fetchLotJourney(lotRef);
  const transferLists = await Promise.all(lots.map((l) => fetchSeasonTransfers(l.season.id)));
  const transfersBySeasonId: Record<string, SeasonTransfer[]> = {};
  lots.forEach((l, i) => (transfersBySeasonId[l.season.id] = transferLists[i]));
  return buildTimeline(lots, transfersBySeasonId);
}

export function ChainView() {
  const lotsState = useAsync(fetchKnownLotRefs, []);
  const [selectedLot, setSelectedLot] = useState<string | null>(null);

  useEffect(() => {
    if (lotsState.status === "ready" && lotsState.data.length > 0 && selectedLot === null) {
      setSelectedLot(lotsState.data[0]);
    }
  }, [lotsState, selectedLot]);

  const timelineState = useAsync(() => (selectedLot ? loadLotView(selectedLot) : Promise.resolve([])), [selectedLot]);

  if (lotsState.status === "loading") return <LoadingBlock label="Loading known lots from the subgraph…" />;
  if (lotsState.status === "error") return <ErrorBlock message={lotsState.error} onRetry={lotsState.reload} />;
  if (lotsState.data.length === 0) {
    return <EmptyBlock title="No lots yet" detail="No lot has been minted on-chain yet. A lot's identifier is assigned at harvest mint." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <label htmlFor="lot-select" className="text-base font-medium text-[var(--text)]">
          Lot
        </label>
        <select
          id="lot-select"
          value={selectedLot ?? ""}
          onChange={(e) => setSelectedLot(e.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base"
        >
          {lotsState.data.map((ref) => (
            <option key={ref} value={ref}>
              {ref}
            </option>
          ))}
        </select>
      </div>

      {timelineState.status === "loading" && <LoadingBlock label="Loading this lot's journey…" />}
      {timelineState.status === "error" && <ErrorBlock message={timelineState.error} onRetry={timelineState.reload} />}
      {timelineState.status === "ready" && timelineState.data.length === 0 && (
        <EmptyBlock title="No events for this lot" detail="This lot has no mint, transfer, transform, or retirement events indexed." />
      )}
      {timelineState.status === "ready" && timelineState.data.length > 0 && (
        <div className="flex flex-col gap-4">
          {timelineState.data.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="flex flex-col items-center pt-2">
                <div className="h-3 w-3 shrink-0 rounded-full bg-[var(--accent)]" />
                {i < timelineState.data.length - 1 && <div className="mt-1 h-full w-px flex-1 bg-[var(--border)]" style={{ minHeight: 40 }} />}
              </div>
              <div className="flex-1">
                <div className="mb-1 text-sm text-[var(--text-muted)]">{formatDate(step.timestamp)}</div>
                <StepCard step={step} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
