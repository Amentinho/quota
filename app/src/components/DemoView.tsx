import { useEffect, useState } from "react";
import { useAsync } from "../lib/useAsync";
import { readTextRecord, readSeasonEnsState } from "../lib/ens";
import { shortAddr } from "../lib/format";
import { roleName } from "../lib/labels";

// Local-only: this view fetches a server on localhost that holds real
// signing keys in memory. It's gated out of the production build by
// App.tsx (import.meta.env.DEV) -- this file's own code never touches a
// key, but it has no reason to exist where that server isn't reachable.
const SERVER_URL = "http://localhost:4317";

// ---------------------------------------------------------------------
// Shared display primitives
// ---------------------------------------------------------------------

// Name as primary, address as secondary -- falls back to just the address
// (no secondary line) for anything not in labels.ts's KNOWN_ROLE_NAMES.
// Purely a display choice: every role check this panel exercises still
// goes through hasRoles against the season resource, never this name.
function RoleIdentity({ address, className = "" }: { address: string; className?: string }) {
  const name = roleName(address);
  if (!name) return <span className={`font-mono ${className}`}>{shortAddr(address)}</span>;
  return (
    <span className={className}>
      <span className="font-semibold">{name}</span>{" "}
      <span className="font-mono text-[var(--text-muted)]">({shortAddr(address)})</span>
    </span>
  );
}

type ActionResult = { ok: boolean; noop?: boolean; headline: string; lotRef?: string; raw: unknown } | null;

// One step in a result's cross-chain path -- "done" is a completed leg
// (with a link to verify it independently, when one exists), "stopped" is
// where a refusal actually happened, "skipped" is a leg that was never
// reached because an earlier one stopped it.
type ChainStep = { label: string; state: "done" | "stopped" | "skipped"; link?: { label: string; url: string } };

function ChainStepSequence({ steps }: { steps: ChainStep[] }) {
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {steps.map((step, i) => (
        <li key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[var(--text-muted)]">→</span>}
          <span
            className={
              step.state === "done"
                ? "rounded-md bg-[var(--accent-soft)] px-2 py-1 text-[var(--accent)]"
                : step.state === "stopped"
                  ? "rounded-md bg-[var(--danger-soft)] px-2 py-1 font-semibold text-[var(--danger)]"
                  : "rounded-md px-2 py-1 text-[var(--text-muted)] line-through"
            }
          >
            {step.label}
          </span>
          {step.link && (
            <a
              href={step.link.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--accent)] underline"
            >
              {step.link.label}
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

function ResultBlock({
  result,
  interpretation,
  steps,
}: {
  result: ActionResult;
  interpretation?: string;
  steps?: ChainStep[];
}) {
  if (!result) return null;
  // noop is neither success nor failure -- the requested change was
  // already true on-chain (grant on an existing holder, revoke on a
  // non-holder), so nothing was sent. Shown neutral, not green or red, so
  // it doesn't read as a refusal or an accomplishment.
  const style = result.noop
    ? "border-[var(--border)] bg-[var(--bg)]"
    : result.ok
      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
      : "border-[var(--danger)] bg-[var(--danger-soft)]";
  const textStyle = result.noop ? "text-[var(--text-muted)]" : result.ok ? "text-[var(--accent)]" : "text-[var(--danger)]";
  const label = result.noop ? "NOTHING SENT" : result.ok ? "SUCCESS" : "FAILED / REFUSED";
  return (
    <div className={`mt-3 rounded-lg border p-3 ${style}`}>
      <p className={`text-base font-semibold ${textStyle}`}>
        {label} — {result.headline}
      </p>
      {result.lotRef && <p className="mt-1 text-sm text-[var(--text-muted)]">lot: {result.lotRef}</p>}
      {/* The interpretation is for reading -- a plain-language gloss of what
          just happened. The raw payload below (collapsed) is for verifying
          -- the actual, unparaphrased response. */}
      {interpretation && <p className="mt-2 text-sm text-[var(--text)]">{interpretation}</p>}
      {steps && steps.length > 0 && <ChainStepSequence steps={steps} />}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Show raw response
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-black/90 p-3 text-xs text-green-400">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      </details>
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

function ProofBadge({ number, name }: { number: number; name: string }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
      Proof {number} — {name}
    </span>
  );
}

// Every action card states, in this order: what clicking the button
// actually does, what outcome to expect (and why), and what that outcome
// proves. The first two are plain description text; the third is the
// line a reader should remember, so it's visually pulled out.
function ActionCard({
  title,
  proof,
  whatThisDoes,
  whatToExpect,
  whatItProves,
  children,
  result,
  interpretation,
  steps,
  pending,
}: {
  title: string;
  proof?: { number: number; name: string };
  whatThisDoes: string;
  whatToExpect: string;
  whatItProves: string;
  children: React.ReactNode;
  result: ActionResult;
  interpretation?: string;
  steps?: ChainStep[];
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-[var(--text)]">{title}</h3>
          {proof && <ProofBadge number={proof.number} name={proof.name} />}
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">What this does: </span>
          {whatThisDoes}
        </p>
        <p className="text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">What to expect: </span>
          {whatToExpect}
        </p>
        <p className="rounded-md border-l-4 border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--accent)]">
          What it proves: {whatItProves}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
      {pending && <p className="text-sm text-[var(--text-muted)]">Signing and submitting…</p>}
      <ResultBlock result={result} interpretation={interpretation} steps={steps} />
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

// `approverAddress` is the field name /config has always returned (the
// underlying Ethereum address and its ENS_APPROVER_KEY/rotate-season-admin
// mechanics are all still named "approver" in scripts/relayer.mjs and
// app/server/index.mjs -- an internal-naming choice, not user-facing).
// This UI displays that same address under the label "Control Body"
// everywhere; only the display label changed, not the field it reads.
type Config = {
  approverAddress: string;
  issuer1Address: string;
  issuer2Address: string;
  treasuryAccountId: string;
  processorAccountId: string;
};

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
    return <p className="text-sm text-[var(--text-muted)]">No address currently holds the minting right.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {holders.map((addr) => (
        <li key={addr} className="rounded-md bg-[var(--accent-soft)] px-3 py-1 text-sm text-[var(--accent)]" title={addr}>
          <RoleIdentity address={addr} />
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------
// Cross-chain interpretation -- one function per action shape, each
// turning a raw server response into a plain-language sentence plus a
// step sequence. These read the SAME raw fields the collapsed JSON
// shows; they never invent information the response didn't contain.
// ---------------------------------------------------------------------

function hashscanUrl(hederaTxId: string): string {
  // Same construction as scripts/relayer.mjs and README: keep the dots in
  // the account portion, replace only "@" and the timestamp's internal
  // "." with "-".
  const [account, timestamp] = hederaTxId.split("@");
  return `https://hashscan.io/testnet/transaction/${account}-${timestamp.replace(".", "-")}`;
}
function etherscanUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

type MintRaw = { hederaTxId?: string; hashscanUrl?: string; sepoliaTxHash?: string; etherscanUrl?: string; message?: string };

function interpretMint(result: ActionResult): { interpretation: string; steps: ChainStep[] } | null {
  if (!result) return null;
  if (result.ok) {
    const raw = result.raw as MintRaw;
    return {
      interpretation:
        "The minting right was checked first, the grams were actually created on Hedera, and that creation was then permanently recorded on Sepolia.",
      steps: [
        { label: "ENS: minting right checked", state: "done" },
        { label: "Hedera: grams minted", state: "done", link: raw.hashscanUrl ? { label: "HashScan", url: raw.hashscanUrl } : undefined },
        { label: "Sepolia: mint recorded", state: "done", link: raw.etherscanUrl ? { label: "Etherscan", url: raw.etherscanUrl } : undefined },
      ],
    };
  }
  const message = (result.raw as MintRaw)?.message ?? result.headline;
  const resolutionFailure = message.toLowerCase().includes("does not resolve");
  return {
    interpretation: resolutionFailure
      ? "Refused before anything was sent anywhere — the season name itself is no longer valid (expired or unregistered)."
      : "Refused before anything was sent anywhere — the check reads the ENS registry directly, and this address doesn't hold the minting right.",
    steps: [
      { label: "ENS: minting right checked — refused here", state: "stopped" },
      { label: "Hedera: never called", state: "skipped" },
      { label: "Sepolia: never called", state: "skipped" },
    ],
  };
}

type TransferRaw = { hederaTxId?: string; sepoliaTxHash?: string };

function interpretTransfer(result: ActionResult): { interpretation: string; steps: ChainStep[] } | null {
  if (!result) return null;
  if (result.ok) {
    const raw = result.raw as TransferRaw;
    return {
      interpretation: "Grams moved from the Treasury to the Processor on Hedera, then that movement was permanently recorded on Sepolia.",
      steps: [
        {
          label: "Hedera: grams transferred",
          state: "done",
          link: raw.hederaTxId ? { label: "HashScan", url: hashscanUrl(raw.hederaTxId) } : undefined,
        },
        {
          label: "Sepolia: transfer recorded",
          state: "done",
          link: raw.sepoliaTxHash ? { label: "Etherscan", url: etherscanUrl(raw.sepoliaTxHash) } : undefined,
        },
      ],
    };
  }
  return {
    interpretation: "The transfer itself failed on Hedera — nothing was recorded on Sepolia.",
    steps: [{ label: "Hedera: transfer failed", state: "stopped" }],
  };
}

type TransformRaw = {
  transformTxHash?: string;
  inputHederaTxId?: string;
  outputHederaTxId?: string;
  retireTxHash?: string;
  mintTxHash?: string;
};
type TransformContext = { inputGrams: number; outputGrams: number; ceiling: number; wasUnderfunded: boolean };

function interpretTransform(
  result: ActionResult,
  ctx: TransformContext | null,
): { interpretation: string; steps: ChainStep[] } | null {
  if (!result) return null;
  if (result.ok) {
    const raw = result.raw as TransformRaw;
    return {
      interpretation: ctx
        ? `The claim (${ctx.outputGrams}g from ${ctx.inputGrams}g) was within the ${ctx.ceiling}g ceiling, so Hedera actually retired the input and minted the output, and both were permanently recorded on Sepolia.`
        : "The claim was within the yield ceiling, so Hedera actually retired the input and minted the output, and both were permanently recorded on Sepolia.",
      steps: [
        {
          label: "Sepolia: yield ceiling checked (reads the ratio from ENS)",
          state: "done",
          link: raw.transformTxHash ? { label: "Etherscan", url: etherscanUrl(raw.transformTxHash) } : undefined,
        },
        {
          label: "Hedera: input retired, output minted",
          state: "done",
          link: raw.inputHederaTxId ? { label: "HashScan (input)", url: hashscanUrl(raw.inputHederaTxId) } : undefined,
        },
        {
          label: "Sepolia: retirement + mint recorded",
          state: "done",
          link: raw.retireTxHash ? { label: "Etherscan", url: etherscanUrl(raw.retireTxHash) } : undefined,
        },
      ],
    };
  }
  if (ctx?.wasUnderfunded) {
    return {
      interpretation: `Refused before anything was sent anywhere — the Processor didn't hold the ${ctx.inputGrams}g being claimed as input.`,
      steps: [
        { label: "Processor balance checked — refused here", state: "stopped" },
        { label: "Sepolia: never called", state: "skipped" },
        { label: "Hedera: never called", state: "skipped" },
      ],
    };
  }
  return {
    interpretation: ctx
      ? `Refused on Sepolia: the yield ceiling for this season is ${ctx.ceiling}g and the claim was ${ctx.outputGrams}g. No Hedera call was made.`
      : "Refused on Sepolia: the claim exceeded the yield ceiling read live from ENS. No Hedera call was made.",
    steps: [
      { label: "Sepolia: yield ceiling checked — refused here", state: "stopped" },
      { label: "Hedera: never called", state: "skipped" },
    ],
  };
}

type RoleRaw = { txHash?: string };

function interpretRole(result: ActionResult): { interpretation: string; steps: ChainStep[] } | null {
  if (!result) return null;
  if (result.noop) {
    return {
      interpretation:
        "Checked on-chain first — this was already true, so nothing was sent. No transaction, no gas spent on a change that wasn't a change.",
      steps: [{ label: "Sepolia: role checked — already correct, nothing sent", state: "stopped" }],
    };
  }
  if (result.ok) {
    const raw = result.raw as RoleRaw;
    return {
      interpretation:
        "The Control Body signed a transaction updating who can mint. This never touches Hedera — the minting right lives entirely in the ENS registry on Sepolia.",
      steps: [
        { label: "Sepolia: role updated", state: "done", link: raw.txHash ? { label: "Etherscan", url: etherscanUrl(raw.txHash) } : undefined },
      ],
    };
  }
  return { interpretation: "The transaction failed.", steps: [{ label: "Sepolia: transaction failed", state: "stopped" }] };
}

// ---------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------

export function DemoView() {
  const configState = useAsync(() => getJson("/config").then((r) => r?.raw as Config), []);

  // 1. Control Body -- holds the minting right's admin authority
  // (on-chain: MINTER_ROLE_ADMIN), never the minting right itself.
  // Grants/revokes the minting right on whatever address is typed into the
  // editable field below; cannot mint itself, proven by the "Attempt mint
  // as Control Body" button. Pre-fills with Issuer 1's address, not the
  // Control Body's own -- an earlier version left this field blank with
  // copy suggesting "paste the Control Body's own address to see a grant
  // succeed," which is exactly what happened: granting the minting right
  // to the Control Body actually gives it that right, silently breaking
  // the separation-of-powers proof below. targetAccountTouched tracks
  // whether the viewer has typed into the field themselves, so the
  // pre-fill doesn't clobber a deliberate edit once Issuer 1's address
  // loads.
  const [targetAccount, setTargetAccount] = useState("");
  const [targetAccountTouched, setTargetAccountTouched] = useState(false);
  const [roleResult, setRoleResult] = useState<ActionResult>(null);
  const [rolePending, setRolePending] = useState(false);
  const [controlBodyMintResult, setControlBodyMintResult] = useState<ActionResult>(null);
  const [controlBodyMintPending, setControlBodyMintPending] = useState(false);

  const minterHoldersState = useAsync(() => readSeasonEnsState("2026"), []);

  // 2. Issuer -- reads the LIVE minting-right holder list (shared with the
  // Control Body section's list above) rather than a hardcoded pair of
  // .env addresses, so granting a new address through this panel and then
  // minting as it works end to end without a code change.
  const [issuerAddress, setIssuerAddress] = useState("");
  const [issuerGrams, setIssuerGrams] = useState(5);
  const [issuerMintResult, setIssuerMintResult] = useState<ActionResult>(null);
  const [issuerMintPending, setIssuerMintPending] = useState(false);

  // 3. Transform flow -- three explicit steps (mint, transfer, transform),
  // each its own button and its own result, with both the Treasury's and
  // the Processor's live token balances shown between them. No step tops
  // anything up silently: transforming more than the Processor was
  // actually transferred fails with a clear refusal, before Sepolia or
  // Hedera is touched (see checkProcessorFunded in scripts/relayer.mjs).
  const processorBalanceState = useAsync(() => getJson("/processor-balance").then((r) => r?.raw as { balance: string }), []);
  const operatorBalanceState = useAsync(() => getJson("/operator-balance").then((r) => r?.raw as { balance: string }), []);

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
  const [transformContext, setTransformContext] = useState<TransformContext | null>(null);
  const [transformPending, setTransformPending] = useState(false);

  const config = configState.status === "ready" ? configState.data : null;
  const minterHolders = minterHoldersState.status === "ready" ? minterHoldersState.data.minterHolders : [];

  // Pre-fill the grant/revoke target with Issuer 1 once known, unless the
  // viewer has already typed something.
  useEffect(() => {
    if (!targetAccountTouched && config?.issuer1Address) {
      setTargetAccount(config.issuer1Address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.issuer1Address]);

  // Default the issuer selector to the first live minting-right holder,
  // and fall back to it if the currently-selected address stops holding
  // that right (e.g. it was just revoked from the Control Body panel).
  useEffect(() => {
    if (minterHolders.length === 0) return;
    if (!minterHolders.some((a) => a.toLowerCase() === issuerAddress.toLowerCase())) {
      setIssuerAddress(minterHolders[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minterHoldersState.status]);

  const targetIsControlBody =
    !!config && !!targetAccount && targetAccount.toLowerCase() === config.approverAddress.toLowerCase();

  const yieldBp = yieldBpState.status === "ready" ? Number(yieldBpState.data) : null;
  const ceilingForInput = yieldBp !== null ? Math.floor((transformInputGrams * yieldBp) / 10000) : null;
  const processorBalanceNum = processorBalanceState.status === "ready" ? Number(processorBalanceState.data.balance) : null;
  const overCeiling = ceilingForInput !== null && transformOutputGrams > ceilingForInput;
  const underfunded = processorBalanceNum !== null && transformInputGrams > processorBalanceNum;

  const roleInterp = interpretRole(roleResult);
  const controlBodyMintInterp = interpretMint(controlBodyMintResult);
  const issuerMintInterp = interpretMint(issuerMintResult);
  const flowMintInterp = interpretMint(flowMintResult);
  const flowTransferInterp = interpretTransfer(flowTransferResult);
  const transformInterp = interpretTransform(transformResult, transformContext);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-3 text-base text-[var(--warn)]">
        Local only. This tab calls a server on <code>localhost:4317</code> that holds real signing keys — it is never
        deployed, and this tab does not exist in the production build. Every action below sends a real transaction.
      </div>

      {/* ===================================================================
          1. WHAT THE SYSTEM ENFORCES, WHO THE ACTORS ARE, WHY TWO CHAINS
          =================================================================== */}
      <div className="flex flex-col gap-4 rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-6">
        <h2 className="text-2xl font-bold text-[var(--text)]">What this tab is showing</h2>
        <p className="text-base text-[var(--text)]">
          QUOTA enforces one rule: exactly one digital unit can exist per certified gram of harvest — supply can
          never exceed what was actually grown, no matter how many times it's transferred or processed.
        </p>

        <dl className="flex flex-col gap-3 rounded-lg bg-[var(--bg)] p-4 text-sm">
          <div>
            <dt className="font-semibold text-[var(--text)]">Consortium</dt>
            <dd className="text-[var(--text-muted)]">
              The <em>Consorzio del Pistacchio Verde di Bronte DOP</em> — the real-world organization that owns the
              "Bronte PDO Pistachio" designation (PDO: Protected Designation of Origin, an EU status; DOP is the
              Italian abbreviation for the same thing) and this project's ENS name. Opens seasons and sets the
              harvest cap. <strong>Does not certify individual producers.</strong>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">Control Body</dt>
            <dd className="text-[var(--text-muted)]">
              An accredited, independent inspector (the Italian term is <em>organismo di controllo</em>). Verifies
              producers and appoints or removes them as Issuers. <strong>Cannot mint a single gram.</strong>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">Issuer</dt>
            <dd className="text-[var(--text-muted)]">
              A certified producer — the grower whose harvest this project's grams represent. Mints only against its
              own certified harvest. <strong>Cannot appoint or remove anyone.</strong>
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">Treasury</dt>
            <dd className="text-[var(--text-muted)]">
              A Hedera account (not a role held by a person or company) that holds newly minted grams until they're
              moved into processing.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--text)]">Processor</dt>
            <dd className="text-[var(--text-muted)]">
              A Hedera account that holds grams mid-transformation, between the transfer step and the transform step.
            </dd>
          </div>
        </dl>

        <p className="text-base text-[var(--text)]">
          This split isn't an arbitrary design choice: EU geographical-indication rules require an independent
          control body precisely so a consortium can never certify itself.
        </p>

        <p className="text-base text-[var(--text)]">
          The rule itself lives as a name and a set of records on ENS (Ethereum Name Service — a public naming
          system; think of it as the phone book this project's rule is written into). Sepolia (Ethereum's public
          testnet) checks that rule and permanently records what happened. Hedera — a separate public ledger, built
          for exactly this kind of token — is where the actual grams live and move. That's why every successful
          action below returns <em>two</em> identifiers, not one: a Hedera transaction ID (the grams actually moved)
          and a Sepolia transaction hash (the event is now on the public record). Together, they're the proof that
          both halves of the system agree.
        </p>
      </div>

      {/* ===================================================================
          2. WHAT TO CLICK FIRST
          =================================================================== */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-xl font-bold text-[var(--text)]">Try it in this order</h2>
        <p className="text-sm text-[var(--text-muted)]">
          The buttons below marked "should be refused" are the ones to click first — each deliberately tries to
          break a different rule, at a different layer, and fails. That refusal is the demonstration, not a bug.
        </p>
        <ol className="flex flex-col gap-2 text-sm text-[var(--text)]">
          <li>
            <strong>1.</strong> Mint as Issuer (Section 2) — a normal mint, succeeds, returns both transaction IDs.
          </li>
          <li>
            <strong>2.</strong> Attempt mint as Control Body (Section 1) — refused. Proof 3.
          </li>
          <li>
            <strong>3.</strong> Revoke the Issuer you just minted as (Section 1, target field defaults to it).
          </li>
          <li>
            <strong>4.</strong> Mint as that Issuer again (Section 2) — now refused. Proof 2. (Grant it back
            afterward so the panel is ready for the next viewer.)
          </li>
          <li>
            <strong>5.</strong> Transform above the yield ceiling (Section 3, Step 3) — e.g. 1000g in, 500g out —
            refused. Proof 4.
          </li>
          <li>
            <strong>6.</strong> Transform at the yield ceiling (Section 3, Step 3) — e.g. 1000g in, 450g out —
            succeeds. (Needs Steps 1–2 of the Transform flow run first, to fund the Processor.)
          </li>
        </ol>
      </div>

      {/* ===================================================================
          3. THE FOUR PROOFS (reference — the sections below are where you
          actually click)
          =================================================================== */}
      <div className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-xl font-bold text-[var(--text)]">The four proofs</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Four different rules, each enforced by a different mechanism — not the same check running four times.
        </p>
        <ol className="flex flex-col gap-3">
          <li className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <ProofBadge number={1} name="Cap, enforced by Hedera consensus" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              The token's maximum supply is fixed when it's created and can never be raised. Proven once, for real,
              while this project was built: minting up to the exact cap succeeded, and the very next gram was
              rejected by Hedera itself — not application code, the network's own consensus refusing the
              transaction —{" "}
              <a
                href="https://hashscan.io/testnet/transaction/0.0.10323351-1788864821-400173065"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--accent)] underline"
              >
                open the actual failed transaction on HashScan
              </a>
              , status <code>TOKEN_MAX_SUPPLY_REACHED</code>, permanent and independently checkable by anyone.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Not a button in this panel, deliberately: reproducing it would mean minting the entire
              3.4-billion-gram harvest cap first, and unlike the other three proofs, that action can't be undone
              afterward to leave the panel ready for the next viewer — the cap, once reached, stays reached. The
              linked transaction above is the real thing, not a re-enactment.
            </p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <ProofBadge number={2} name="Minting right, enforced by ENS" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Only a producer the Control Body has appointed holds the right to mint. Try it in Section 1 (revoke an
              Issuer) and Section 2 (mint as that Issuer — refused).
            </p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <ProofBadge number={3} name="Separation of powers, enforced by ENS" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Appointing Issuers and minting are different rights, held by different roles — the Control Body that
              certifies producers can never mint itself. Try it in Section 1.
            </p>
          </li>
          <li className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <ProofBadge number={4} name="Yield ceiling, enforced on Sepolia against an ENS record" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              A transformation can never claim more output than the declared yield ratio allows, and that ratio is
              read live from ENS by the contract itself — not supplied by whoever's calling. Try it in Section 3,
              Step 3.
            </p>
          </li>
        </ol>
      </div>

      {/* ===================================================================
          4. CONSORTIUM → CONTROL BODY
          =================================================================== */}
      <Section
        step="1 — Consortium → Control Body"
        title="Control Body"
        description="Verifies producers and appoints or removes them as Issuers. Never holds the right to mint itself."
      >
        {config && (
          <p className="text-sm text-[var(--text-muted)]">
            Control Body: <RoleIdentity address={config.approverAddress} className="text-[var(--text)]" />
          </p>
        )}

        <ActionCard
          title="Grant / revoke the minting right"
          whatThisDoes="The Control Body, using its own signing key, adds or removes the minting right for the address typed below (pre-filled with Issuer 1 — edit it to target any address)."
          whatToExpect="Succeeds and sends a real transaction if the address's minting right is actually changing. If it already matches what you're asking for, nothing is sent — shown as NOTHING SENT below, checked on-chain first rather than sent and left to fail or waste gas."
          whatItProves="The Control Body — and only the Control Body — controls who can mint, without ever being able to mint itself."
          result={roleResult}
          interpretation={roleInterp?.interpretation}
          steps={roleInterp?.steps}
          pending={rolePending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            target address{" "}
            <input
              type="text"
              value={targetAccount}
              onChange={(e) => {
                setTargetAccountTouched(true);
                setTargetAccount(e.target.value);
              }}
              placeholder="0x…"
              className={`${inputClass} w-96 font-mono`}
            />
          </label>
          {targetIsControlBody && (
            <p className="w-full rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 font-semibold text-[var(--danger)]">
              This is the Control Body's own address. Granting it the minting right breaks the separation this panel
              is demonstrating — it would then be able to both appoint Issuers and mint.
            </p>
          )}
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
            Grant minting right
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
            Revoke minting right
          </button>
        </ActionCard>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[var(--text)]">Who currently holds the minting right</h3>
            <button className={buttonSecondaryClass} onClick={() => minterHoldersState.reload()}>
              Refresh
            </button>
          </div>
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            Read live from Sepolia's ENS registry (the on-chain role is called <code>MINTER</code>).
          </p>
          {minterHoldersState.status === "loading" && <p className="text-sm text-[var(--text-muted)]">Reading live from Sepolia…</p>}
          {minterHoldersState.status === "error" && <p className="text-sm text-[var(--danger)]">{minterHoldersState.error}</p>}
          {minterHoldersState.status === "ready" && <MinterHolderList holders={minterHoldersState.data.minterHolders} />}
        </div>

        <ActionCard
          title="Attempt mint as Control Body"
          proof={{ number: 3, name: "Separation of powers" }}
          whatThisDoes="Tries to mint 1g using the Control Body's own address as the minting identity."
          whatToExpect="Always refused, before any transaction is sent — the Control Body never holds the minting right, no matter how many Issuers it has appointed."
          whatItProves="Admin authority does not imply minting authority. The Control Body appoints every Issuer and still cannot mint a single gram."
          result={controlBodyMintResult}
          interpretation={controlBodyMintInterp?.interpretation}
          steps={controlBodyMintInterp?.steps}
          pending={controlBodyMintPending}
        >
          <button
            className={buttonDangerClass}
            disabled={controlBodyMintPending || !config}
            onClick={async () => {
              setControlBodyMintPending(true);
              setControlBodyMintResult(await post("/mint", { grams: 1, certifier: config?.approverAddress }));
              setControlBodyMintPending(false);
            }}
          >
            Attempt mint as Control Body (should be refused)
          </button>
        </ActionCard>
      </Section>

      {/* ===================================================================
          5. ISSUER
          =================================================================== */}
      <Section
        step="2 — Issuer"
        title="Issuer"
        description="The only role allowed to mint. The dropdown below reads the same live list shown in Section 1."
      >
        <ActionCard
          title="Mint as Issuer"
          proof={{ number: 2, name: "Minting right (after a revoke above)" }}
          whatThisDoes="Mints the given amount of harvest-token grams, using the selected address's minting right as authorization."
          whatToExpect="Succeeds if the selected address currently holds the minting right — the normal case. Refused if it doesn't, e.g. right after the Control Body revokes it in Section 1."
          whatItProves="Minting requires the minting right, checked fresh every time — not a permission you keep forever once granted, and not implied by anything else."
          result={issuerMintResult}
          interpretation={issuerMintInterp?.interpretation}
          steps={issuerMintInterp?.steps}
          pending={issuerMintPending}
        >
          <label className="text-sm text-[var(--text-muted)]">
            mint as{" "}
            <select value={issuerAddress} onChange={(e) => setIssuerAddress(e.target.value)} className={`${inputClass} font-mono`}>
              {minterHolders.length === 0 && <option value="">No one currently holds the minting right</option>}
              {minterHolders.map((addr) => (
                <option key={addr} value={addr}>
                  {roleName(addr) ? `${roleName(addr)} (${shortAddr(addr)})` : shortAddr(addr)}
                </option>
              ))}
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

      {/* ===================================================================
          6. TRANSFORM FLOW
          =================================================================== */}
      <Section
        step="3 — Transform flow"
        title="Mint → Transfer → Transform"
        description="Three separate Hedera transactions, each recorded on Sepolia. Nothing moves automatically between the Treasury, the Processor, or across the transform step."
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1 text-base font-semibold text-[var(--text)]">
              <span>
                Treasury {config ? <span className="font-mono text-[var(--text-muted)]">{config.treasuryAccountId}</span> : ""} —{" "}
                {operatorBalanceState.status === "ready" ? `${BigInt(operatorBalanceState.data.balance).toLocaleString()}g` : "…"}
              </span>
              <span>
                Processor {config ? <span className="font-mono text-[var(--text-muted)]">{config.processorAccountId}</span> : ""} —{" "}
                {processorBalanceState.status === "ready" ? `${BigInt(processorBalanceState.data.balance).toLocaleString()}g` : "…"}
              </span>
            </div>
            <button
              className={buttonSecondaryClass}
              onClick={() => {
                operatorBalanceState.reload();
                processorBalanceState.reload();
              }}
            >
              Refresh
            </button>
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            These are Hedera accounts holding tokens, identified by account ID; the roles above are Ethereum
            addresses identified by ENS names. Different chains, different identity systems.
          </p>
        </div>

        <ActionCard
          title="Step 1 — Mint (to Treasury)"
          whatThisDoes="Mints fresh harvest-token grams to the Treasury, using Issuer 1's minting right. A separate mint from the one in Section 2 — it doesn't consume or relate to that mint in any way; both just draw against the same season cap."
          whatToExpect="Succeeds (Issuer 1 holds the minting right in this flow, unless you revoked it in Section 1 and haven't granted it back)."
          whatItProves="Minting is just minting — it doesn't automatically move grams anywhere else. Only the Treasury balance above changes; the Processor's doesn't."
          result={flowMintResult}
          interpretation={flowMintInterp?.interpretation}
          steps={flowMintInterp?.steps}
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
              operatorBalanceState.reload();
              setFlowMintPending(false);
            }}
          >
            Mint
          </button>
        </ActionCard>

        <ActionCard
          title="Step 2 — Transfer (Treasury → Processor)"
          whatThisDoes="Moves grams from the Treasury to the Processor, a real Hedera custody transfer."
          whatToExpect="Succeeds as long as the Treasury holds enough — its balance is everything ever minted to it, not just what Step 1 just minted, so it's almost always enough."
          whatItProves="Custody is a real, separate transfer. The Processor only ever holds what's actually been moved to it, not whatever the Treasury happens to have."
          result={flowTransferResult}
          interpretation={flowTransferInterp?.interpretation}
          steps={flowTransferInterp?.steps}
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
              operatorBalanceState.reload();
              processorBalanceState.reload();
              setFlowTransferPending(false);
            }}
          >
            Transfer
          </button>
        </ActionCard>

        <ActionCard
          title="Step 3 — Transform"
          proof={{ number: 4, name: "Yield ceiling" }}
          whatThisDoes='Claims that the "grams in" shown below are consumed by processing to produce the claimed "grams out" of kernel (the processed pistachio product).'
          whatToExpect="Refused, before anything is sent anywhere, if the Processor doesn't hold at least the input amount (fund it with Steps 1–2 first). Otherwise refused on Sepolia if the output exceeds the yield ceiling. Otherwise succeeds."
          whatItProves="The yield ratio is enforced by the contract itself, reading it live from ENS on every call — not a number a caller gets to claim."
          result={transformResult}
          interpretation={transformInterp?.interpretation}
          steps={transformInterp?.steps}
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
              setTransformContext({
                inputGrams: transformInputGrams,
                outputGrams: transformOutputGrams,
                ceiling: ceilingForInput ?? 0,
                wasUnderfunded: underfunded,
              });
              setTransformResult(await post("/transform", { inputGrams: transformInputGrams, outputGrams: transformOutputGrams }));
              processorBalanceState.reload();
              setTransformPending(false);
            }}
          >
            Transform
          </button>

          <div className="w-full text-sm text-[var(--text-muted)]">
            {yieldBpState.status === "loading" && "Reading the declared yield ratio from ENS…"}
            {yieldBpState.status === "error" && `Could not read the yield ratio from ENS: ${yieldBpState.error}`}
            {yieldBpState.status === "ready" && yieldBp !== null && ceilingForInput !== null && (
              <>
                <span className={overCeiling ? "font-semibold text-[var(--danger)]" : ""}>
                  The declared yield ratio for kernel is {(yieldBp / 100).toFixed(2)}% ({yieldBp} basis points, or
                  "bp") — so the maximum allowed output for {transformInputGrams}g in is {ceilingForInput}g.
                  {overCeiling &&
                    ` You're claiming ${transformOutputGrams}g, which exceeds this — expect a refusal on Sepolia.`}
                </span>
                {underfunded && processorBalanceNum !== null && (
                  <p className="mt-1 font-semibold text-[var(--danger)]">
                    The Processor currently holds {processorBalanceNum}g, but this claims {transformInputGrams}g as
                    input — expect a refusal before anything is sent anywhere.
                  </p>
                )}
              </>
            )}
          </div>
        </ActionCard>
      </Section>
    </div>
  );
}
