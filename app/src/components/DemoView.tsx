import { useState } from "react";
import { useAsync } from "../lib/useAsync";
import { readTextRecord } from "../lib/ens";

// Local-only: this view fetches a server on localhost that holds real
// signing keys in memory. It's gated out of the production build by
// App.tsx (import.meta.env.DEV) -- this file's own code never touches a
// key, but it has no reason to exist where that server isn't reachable.
const SERVER_URL = "http://localhost:4317";

type ActionResult = { ok: boolean; headline: string; lotRef?: string; raw: unknown } | null;

function ResultBlock({ result }: { result: ActionResult }) {
  if (!result) return null;
  return (
    <div className={`mt-3 rounded-lg border p-3 ${result.ok ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--danger)] bg-[var(--danger-soft)]"}`}>
      <p className={`text-base font-semibold ${result.ok ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
        {result.ok ? "SUCCESS" : "FAILED / REFUSED"} — {result.headline}
      </p>
      {result.lotRef && <p className="mt-1 text-sm text-[var(--text-muted)]">lot: {result.lotRef}</p>}
      <p className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Raw response</p>
      <pre className="overflow-x-auto rounded-md bg-black/90 p-3 text-xs text-green-400">
        {JSON.stringify(result.raw, null, 2)}
      </pre>
    </div>
  );
}

function ActionCard({
  title,
  description,
  children,
  result,
  pending,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  result: ActionResult;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div>
        <h3 className="text-xl font-semibold text-[var(--text)]">{title}</h3>
        <p className="text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      {pending && <p className="text-sm text-[var(--text-muted)]">Signing and submitting…</p>}
      <ResultBlock result={result} />
    </div>
  );
}

const buttonClass =
  "rounded-md bg-[var(--accent)] px-4 py-2 text-base font-semibold text-white hover:opacity-90 disabled:opacity-50";
const buttonSecondaryClass =
  "rounded-md border border-[var(--text-muted)] px-4 py-2 text-base font-semibold text-[var(--text)] hover:bg-[var(--accent-soft)] disabled:opacity-50";

export function DemoView() {
  const [grams, setGrams] = useState(5);
  const [mintResult, setMintResult] = useState<ActionResult>(null);
  const [mintPending, setMintPending] = useState(false);

  const [roleResult, setRoleResult] = useState<ActionResult>(null);
  const [rolePending, setRolePending] = useState(false);

  // Read once, live from the harvest season's own ENS resolver -- the exact
  // record recordTransform itself reads (quota.yield.<productType>.bp) at
  // transform time. The ceiling shown below is recomputed from this value on
  // every keystroke, but the ENS read itself only needs to happen once: the
  // ratio doesn't change while someone's typing a candidate input amount.
  const yieldBpState = useAsync(() => readTextRecord("2026", "quota.yield.kernel.bp"), []);

  const [transformInputGrams, setTransformInputGrams] = useState(1000);
  const [transformOutputGrams, setTransformOutputGrams] = useState(450);
  const [transformResult, setTransformResult] = useState<ActionResult>(null);
  const [transformPending, setTransformPending] = useState(false);

  async function post(path: string, body?: Record<string, unknown>): Promise<ActionResult> {
    try {
      const res = await fetch(`${SERVER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      return await res.json();
    } catch {
      return {
        ok: false,
        headline: "Could not reach the local demo server.",
        raw: { message: `Is it running? cd app/server && npm start (expects ${SERVER_URL})` },
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-base text-[var(--warn)]">
        Local only. This tab calls a server on <code>localhost:4317</code> that holds real signing keys — it is never
        deployed, and this tab does not exist in the production build. Every action below sends a real transaction.
      </div>

      <ActionCard
        title="Mint as certifier"
        description="Mints on Hedera, then anchors the mint on Sepolia through the certifier's authorization check."
        result={mintResult}
        pending={mintPending}
      >
        <label className="text-sm text-[var(--text-muted)]">
          grams{" "}
          <input
            type="number"
            value={grams}
            onChange={(e) => setGrams(Number(e.target.value))}
            className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1"
          />
        </label>
        <button
          className={buttonClass}
          disabled={mintPending}
          onClick={async () => {
            setMintPending(true);
            setMintResult(await post("/mint", { grams }));
            setMintPending(false);
          }}
        >
          Mint
        </button>
      </ActionCard>

      <ActionCard
        title="MINTER role"
        description="Revoke the certifier's role, then click Mint above again to see the refusal — no transaction sent. Grant restores it."
        result={roleResult}
        pending={rolePending}
      >
        <button
          className={buttonSecondaryClass}
          disabled={rolePending}
          onClick={async () => {
            setRolePending(true);
            setRoleResult(await post("/revoke-minter"));
            setRolePending(false);
          }}
        >
          Revoke MINTER role
        </button>
        <button
          className={buttonSecondaryClass}
          disabled={rolePending}
          onClick={async () => {
            setRolePending(true);
            setRoleResult(await post("/grant-minter"));
            setRolePending(false);
          }}
        >
          Grant MINTER role (restore)
        </button>
      </ActionCard>

      <ActionCard
        title="Transform"
        description="Both fields are editable. The ceiling below is computed live — floor(input × yieldBp / 10000), yieldBp read from ENS — not hardcoded to any one input/output pair. Pre-filled at 1000g → 450g (exactly the 45% ceiling) for a one-click happy path; type over either field to try a different amount, including one that exceeds the ceiling."
        result={transformResult}
        pending={transformPending}
      >
        <label className="text-sm text-[var(--text-muted)]">
          grams in{" "}
          <input
            type="number"
            value={transformInputGrams}
            onChange={(e) => setTransformInputGrams(Number(e.target.value))}
            className="ml-1 w-24 rounded border border-[var(--border)] px-2 py-1"
          />
        </label>
        <label className="text-sm text-[var(--text-muted)]">
          grams claimed out{" "}
          <input
            type="number"
            value={transformOutputGrams}
            onChange={(e) => setTransformOutputGrams(Number(e.target.value))}
            className="ml-1 w-24 rounded border border-[var(--border)] px-2 py-1"
          />
        </label>
        <button
          className={buttonClass}
          disabled={transformPending}
          onClick={async () => {
            setTransformPending(true);
            setTransformResult(await post("/transform", { inputGrams: transformInputGrams, outputGrams: transformOutputGrams }));
            setTransformPending(false);
          }}
        >
          Transform
        </button>

        <div className="w-full text-sm text-[var(--text-muted)]">
          {yieldBpState.status === "loading" && "Reading quota.yield.kernel.bp from ENS…"}
          {yieldBpState.status === "error" && `Could not read the yield ratio from ENS: ${yieldBpState.error}`}
          {yieldBpState.status === "ready" &&
            (() => {
              const yieldBp = Number(yieldBpState.data);
              const ceiling = Math.floor((transformInputGrams * yieldBp) / 10000);
              const overCeiling = transformOutputGrams > ceiling;
              return (
                <span className={overCeiling ? "font-semibold text-[var(--danger)]" : ""}>
                  at {yieldBp}bp, ceiling = floor({transformInputGrams} × {yieldBp} / 10000) = {ceiling}g
                  {overCeiling && ` — claiming ${transformOutputGrams}g exceeds this, should revert`}
                </span>
              );
            })()}
        </div>
      </ActionCard>
    </div>
  );
}
