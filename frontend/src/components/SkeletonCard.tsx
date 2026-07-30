// Skeleton loading components
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-xl border border-white/5 bg-white/5 ${className ?? "h-24"}`} />
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" style={{ opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}
