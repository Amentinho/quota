import { useState } from "react";
import { useAsync } from "../lib/useAsync";
import { readTextRecord, readSeasonEnsState } from "../lib/ens";
import { shortAddr } from "../lib/format";

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

function Section({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">{step}</span>
        <h2 className="text-2xl font-bold text-[var(--text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
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
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
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
const buttonDangerClass =
  "rounded-md border border-[var(--danger)] px-4 py-2 text-base font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-50";
const inputClass = "ml-1 rounded border border-[var(--border)] px-2 py-1";

type Config = { approverAddress: string; issuer1Address: string; issuer2Address: string };

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

async function getJson(path: string): Promise<ActionResult> {
  try {
    const res = await fetch(`${SERVER_URL}${path}`);
    return await res.json();
  } catch {
    return {
      ok: false,
      headline: "Could not reach the local demo server.",
      raw: { message: `Is it running? cd app/server && npm start (expects ${SERVER_URL})` },
    };
  }
}

function MinterHolderList({ holders }: { holders: string[] }) {
  if (holders.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No account currently holds MINTER on this season.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {holders.map((addr) => (
        <li key={addr} className="rounded-md bg-[var(--accent-soft)] px-3 py-1 font-mono text-sm text-[var(--accent)]" title={addr}>
          {shortAddr(addr)}
        </li>
      ))}
    </ul>
  );
}

export function DemoView() {
  const configState = useAsync(() => getJson("/config").then((r) => r?.raw as Config), []);

  // 1. Approver -- holds MINTER_ROLE_ADMIN, never MINTER. Grants/revokes
  // MINTER on whatever address is typed into the editable field below;
  // cannot mint itself, proven by the "Attempt mint as Approver" button.
  const [targetAccount, setTargetAccount] = useState("");
  const [roleResult, setRoleResult] = useState<ActionResult>(null);
  const [rolePending, setRolePending] = useState(false);
  const [approverMintResult, setApproverMintResult] = useState<ActionResult>(null);
  const [approverMintPending, setApproverMintPending] = useState(false);

  const minterHoldersState = useAsync(() => readSeasonEnsState("2026"), []);

  // 2. Issuer -- holds MINTER, cannot grant. Mints as whichever of the two
  // issuer addresses is selected.
  const [issuerChoice, setIssuerChoice] = useState<"issuer1" | "issuer2">("issuer1");
  const [issuerGrams, setIssuerGrams] = useState(5);
  const [issuerMintResult, setIssuerMintResult] = useState<ActionResult>(null);
  const [issuerMintPending, setIssuerMintPending] = useState(false);

  // 3. Transform flow -- three explicit steps (mint, transfer, transform),
  // each its own button and its own result, with the processor's live
  // token balance shown between them. No step tops anything up silently:
  // transforming more than the processor was actually transferred fails
  // with a clear refusal from the relayer, before Sepolia or Hedera is
  // touched (see checkProcessorFunded in scripts/relayer.mjs).
  const processorBalanceState = useAsync(() => getJson("/processor-balance").then((r) => r?.raw as { balance: string }), []);

  const [flowMintGrams, setFlowMintGrams] = useState(100);
  const [flowMintResult, setFlowMintResult] = useState<ActionResult>(null);
  const [flowMintPending, setFlowMintPending] = useState(false);

  const [flowTransferGrams, setFlowTransferGrams] = useState(100);
  const [flowTransferResult, setFlowTransferResult] = useState<ActionResult>(null);
  const [flowTransferPending, setFlowTransferPending] = useState(false);

  const yieldBpState = useAsync(() => readTextRecord("2026", "quota.yield.kernel.bp"), []);
  const [transformInputGrams, setTransformInputGrams] = useState(1000);
  const [transformOutputGrams, setTransformOutputGrams] = useState(450);
  const [transformResult, setTransformResult] = useState<ActionResult>(null);
  const [transformPending, setTransformPending] = useState(false);

  const config = configState.status === "ready" ? configState.data : null;
  const issuerAddress = issuerChoice === "issuer1" ? config?.issuer1Address : config?.issuer2Address;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-base text-[var(--warn)]">
        Local only. This tab calls a server on <code>localhost:4317</code> that holds real signing keys — it is never
        deployed, and this tab does not exist in the production build. Every action below sends a real transaction.
      </div>

      <Section
        step="1 — Consortium → Approver"
        title="Approver"
        description="Holds MINTER_ROLE_ADMIN on the 2026 season, granted at registration via a dedicated, freshly-derived keypair — never the relayer's own address. Can grant and revoke MINTER on other addresses. Cannot mint: the button below proves it, on-chain, every time."
      >
        {config && (
          <p className="text-sm text-[var(--text-muted)]">
            Approver address: <span className="font-mono text-[var(--text)]">{config.approverAddress}</span>
          </p>
        )}

        <ActionCard
          title="Grant / revoke MINTER"
          description="Targets whatever address is typed below — try an issuer address, or paste the Approver's own to see a grant succeed without that making it able to mint."
          result={roleResult}
          pending={rolePending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            target address{" "}
            <input
              type="text"
              value={targetAccount}
              onChange={(e) => setTargetAccount(e.target.value)}
              placeholder="0x…"
              className={`${inputClass} w-96 font-mono`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={rolePending || !targetAccount}
            onClick={async () => {
              setRolePending(true);
              setRoleResult(await post("/grant-minter", { account: targetAccount }));
              minterHoldersState.reload();
              setRolePending(false);
            }}
          >
            Grant MINTER
          </button>
          <button
            className={buttonSecondaryClass}
            disabled={rolePending || !targetAccount}
            onClick={async () => {
              setRolePending(true);
              setRoleResult(await post("/revoke-minter", { account: targetAccount }));
              minterHoldersState.reload();
              setRolePending(false);
            }}
          >
            Revoke MINTER
          </button>
        </ActionCard>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text)]">Current MINTER holders</h3>
            <button className={buttonSecondaryClass} onClick={() => minterHoldersState.reload()}>
              Refresh
            </button>
          </div>
          {minterHoldersState.status === "loading" && <p className="text-sm text-[var(--text-muted)]">Reading live from Sepolia…</p>}
          {minterHoldersState.status === "error" && <p className="text-sm text-[var(--danger)]">{minterHoldersState.error}</p>}
          {minterHoldersState.status === "ready" && <MinterHolderList holders={minterHoldersState.data.minterHolders} />}
        </div>

        <ActionCard
          title="Attempt mint as Approver"
          description="Mints 1g using the Approver's own address as certifier. The Approver holds MINTER_ROLE_ADMIN, not MINTER — this should be refused before any transaction is sent, proving admin authority does not imply minting authority."
          result={approverMintResult}
          pending={approverMintPending}
        >
          <button
            className={buttonDangerClass}
            disabled={approverMintPending || !config}
            onClick={async () => {
              setApproverMintPending(true);
              setApproverMintResult(await post("/mint", { grams: 1, certifier: config?.approverAddress }));
              setApproverMintPending(false);
            }}
          >
            Attempt mint as Approver (should be refused)
          </button>
        </ActionCard>
      </Section>

      <Section
        step="2 — Issuer"
        title="Issuer"
        description="Two addresses hold MINTER on the 2026 season. Either can mint; neither can grant or revoke MINTER on anyone, including itself."
      >
        <ActionCard title="Mint as issuer" description="Mints on Hedera, then anchors on Sepolia through the selected issuer's MINTER check." result={issuerMintResult} pending={issuerMintPending}>
          <label className="text-sm text-[var(--text-muted)]">
            issuer{" "}
            <select
              value={issuerChoice}
              onChange={(e) => setIssuerChoice(e.target.value as "issuer1" | "issuer2")}
              className={inputClass}
            >
              <option value="issuer1">Issuer 1 {config ? `(${shortAddr(config.issuer1Address)})` : ""}</option>
              <option value="issuer2">Issuer 2 {config ? `(${shortAddr(config.issuer2Address)})` : ""}</option>
            </select>
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            grams{" "}
            <input
              type="number"
              value={issuerGrams}
              onChange={(e) => setIssuerGrams(Number(e.target.value))}
              className={`${inputClass} w-20`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={issuerMintPending || !issuerAddress}
            onClick={async () => {
              setIssuerMintPending(true);
              setIssuerMintResult(await post("/mint", { grams: issuerGrams, certifier: issuerAddress }));
              setIssuerMintPending(false);
            }}
          >
            Mint
          </button>
        </ActionCard>
      </Section>

      <Section
        step="3 — Transform flow"
        title="Mint → Transfer → Transform"
        description="Three explicit steps, each its own transaction. Nothing tops up the processor account silently — if you transform more than you've transferred in, it fails visibly, before Sepolia or Hedera is touched."
      >
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <span className="text-base font-semibold text-[var(--text)]">
            Processor's live harvest-token balance:{" "}
            {processorBalanceState.status === "ready" ? `${processorBalanceState.data.balance}g` : "…"}
          </span>
          <button className={buttonSecondaryClass} onClick={() => processorBalanceState.reload()}>
            Refresh
          </button>
        </div>

        <ActionCard
          title="Step 1 — Mint (to operator)"
          description="Mints fresh harvest-token grams to the operator account, as Issuer 1. Does not touch the processor."
          result={flowMintResult}
          pending={flowMintPending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            grams{" "}
            <input
              type="number"
              value={flowMintGrams}
              onChange={(e) => setFlowMintGrams(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={flowMintPending || !config}
            onClick={async () => {
              setFlowMintPending(true);
              setFlowMintResult(await post("/mint", { grams: flowMintGrams, certifier: config?.issuer1Address }));
              setFlowMintPending(false);
            }}
          >
            Mint
          </button>
        </ActionCard>

        <ActionCard
          title="Step 2 — Transfer (operator → processor)"
          description="Moves grams from the operator to the processor account. Only after this does the processor's balance (above) actually go up."
          result={flowTransferResult}
          pending={flowTransferPending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            grams{" "}
            <input
              type="number"
              value={flowTransferGrams}
              onChange={(e) => setFlowTransferGrams(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={flowTransferPending}
            onClick={async () => {
              setFlowTransferPending(true);
              setFlowTransferResult(await post("/transfer", { grams: flowTransferGrams }));
              processorBalanceState.reload();
              setFlowTransferPending(false);
            }}
          >
            Transfer
          </button>
        </ActionCard>

        <ActionCard
          title="Step 3 — Transform"
          description="Claims input grams are consumed to produce output grams of kernel. Refuses up front — no transaction at all — if the processor (balance shown above) doesn't hold at least the claimed input. Otherwise checks the on-chain yield ceiling before touching Hedera. Try 1000g in / 450g out after transferring only 100g, to see the funding refusal on screen."
          result={transformResult}
          pending={transformPending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            grams in{" "}
            <input
              type="number"
              value={transformInputGrams}
              onChange={(e) => setTransformInputGrams(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </label>
          <label className="text-sm text-[var(--text-muted)]">
            grams claimed out{" "}
            <input
              type="number"
              value={transformOutputGrams}
              onChange={(e) => setTransformOutputGrams(Number(e.target.value))}
              className={`${inputClass} w-24`}
            />
          </label>
          <button
            className={buttonClass}
            disabled={transformPending}
            onClick={async () => {
              setTransformPending(true);
              setTransformResult(await post("/transform", { inputGrams: transformInputGrams, outputGrams: transformOutputGrams }));
              processorBalanceState.reload();
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
                const processorBalance =
                  processorBalanceState.status === "ready" ? Number(processorBalanceState.data.balance) : null;
                const underfunded = processorBalance !== null && transformInputGrams > processorBalance;
                return (
                  <>
                    <span className={overCeiling ? "font-semibold text-[var(--danger)]" : ""}>
                      at {yieldBp}bp, ceiling = floor({transformInputGrams} × {yieldBp} / 10000) = {ceiling}g
                      {overCeiling && ` — claiming ${transformOutputGrams}g exceeds this, should revert`}
                    </span>
                    {underfunded && (
                      <p className="mt-1 font-semibold text-[var(--danger)]">
                        processor holds {processorBalance}g, this claims {transformInputGrams}g in — should be refused before any
                        transaction is sent
                      </p>
                    )}
                  </>
                );
              })()}
          </div>
        </ActionCard>
      </Section>
    </div>
  );
}
