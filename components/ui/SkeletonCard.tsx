export default function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="skeleton h-4 rounded" style={{ width: "40%" }} />
      <div className="divider" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton rounded"
          style={{ height: 13, width: `${88 - i * 14}%` }}
        />
      ))}
    </div>
  )
}
