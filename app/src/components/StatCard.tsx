export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "warn" | "danger";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "warn"
        ? "text-[var(--warn)]"
        : tone === "danger"
          ? "text-[var(--danger)]"
          : "text-[var(--text)]";

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <span className="text-sm font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
      <span className={`tabular whitespace-nowrap text-2xl font-semibold leading-tight ${toneClass}`}>{value}</span>
      {sub && <span className="text-sm text-[var(--text-muted)]">{sub}</span>}
    </div>
  );
}
