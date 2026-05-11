export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="text-center py-12 text-ink-3">
      <div className="text-lg font-medium mb-1 text-ink-2">{title}</div>
      <div className="text-sm">Coming in Phase 2.</div>
    </div>
  );
}
