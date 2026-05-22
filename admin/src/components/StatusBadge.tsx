interface Props {
  status: string | null;
  size?: 'sm' | 'md';
}

const CONFIG: Record<string, { label: string; cls: string }> = {
  ok:           { label: 'OK',             cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  broken:       { label: 'Quebrado',       cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  human_review: { label: 'Revisão humana', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  snoozed:      { label: 'Adiado',         cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  unknown:      { label: 'Desconhecido',   cls: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  uncertain:    { label: 'Incerto',        cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

export default function StatusBadge({ status, size = 'md' }: Props) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>;
  const cfg = CONFIG[status] ?? CONFIG.unknown;
  const pad = size === 'sm' ? 'px-1.5 py-0' : 'px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full border ${pad} ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}
