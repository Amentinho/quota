export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--accent)]" />
      <p className="text-lg text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] p-12 text-center">
      <p className="text-lg font-semibold text-[var(--danger)]">Couldn't load this data</p>
      <p className="max-w-md text-base text-[var(--text)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md border border-[var(--danger)] px-4 py-2 text-sm font-medium text-[var(--danger)] hover:bg-white"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center">
      <p className="text-lg font-semibold text-[var(--text)]">{title}</p>
      <p className="max-w-md text-base text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}
