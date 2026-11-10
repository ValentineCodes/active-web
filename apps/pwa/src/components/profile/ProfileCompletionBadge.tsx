export function ProfileCompletionBadge({ percent }: { percent: number }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-active-soft px-4 py-3">
      <p className="text-2xl font-bold leading-8 text-active">{percent}%</p>
      <p className="text-xs font-bold uppercase leading-4 tracking-widest text-subtle">Completion</p>
    </div>
  );
}
