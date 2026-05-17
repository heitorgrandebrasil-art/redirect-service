import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { getAnalyticsOverview, checkLinks } from '../lib/api';
import { s } from '../lib/styles';

const PLATFORM_COLORS: Record<string, string> = {
  youtube: 'bg-red-500', instagram: 'bg-pink-500', tiktok: 'bg-slate-700',
  facebook: 'bg-blue-500', x: 'bg-gray-600', outros: 'bg-purple-400',
};
const DEVICE_COLORS: Record<string, string> = {
  desktop: 'bg-brand-600', mobile: 'bg-emerald-500', tablet: 'bg-amber-500', unknown: 'bg-gray-400',
};
const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', unknown: 'Desconhecido',
};

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className={s.cardPad}>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      {sub && <p className={`${s.hint} mt-1`}>{sub}</p>}
    </div>
  );
}

function BarChart({ rows, colorMap, labelMap }: {
  rows: { label: string; clicks: number }[];
  colorMap?: Record<string, string>;
  labelMap?: Record<string, string>;
}) {
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  if (rows.length === 0) return <p className={`${s.textMuted} text-sm text-center py-4`}>Sem dados ainda</p>;
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const pct = Math.round((row.clicks / max) * 100);
        const color = colorMap?.[row.label] ?? 'bg-brand-500';
        const label = labelMap?.[row.label] ?? row.label;
        return (
          <div key={row.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-700 dark:text-gray-300 font-medium capitalize">{label}</span>
              <span className={s.textMuted}>{row.clicks.toLocaleString('pt-BR')}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
              <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const overview = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalyticsOverview,
    refetchInterval: 60_000,
  });

  const [checkResult, setCheckResult] = useState<null | { checked: number; broken: number; brokenItems: any[] }>(null);
  const linkCheck = useMutation({
    mutationFn: checkLinks,
    onSuccess: (data) => setCheckResult(data),
  });

  const data = overview.data;
  const totals = data?.totals ?? {};

  const deviceRows = (data?.byDevice ?? []).map((r: any) => ({ label: r.device, clicks: r.clicks }));
  const platformRows = (data?.byPlatform ?? []).map((r: any) => ({
    label: r.platform ?? 'outros', clicks: r.clicks,
  }));
  const topCampaigns = data?.topCampaigns ?? [];

  return (
    <div className={s.page}>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className={s.h1}>Dashboard</h1>
          <p className={s.sub}>Atualiza a cada minuto</p>
        </div>
        <div className="shrink-0 text-right">
          <button
            onClick={() => { setCheckResult(null); linkCheck.mutate(); }}
            disabled={linkCheck.isPending}
            className={s.btnSecondary}
          >
            {linkCheck.isPending ? 'Verificando...' : '🔍 Verificar todos os links'}
          </button>
          {checkResult && (
            <p className={`text-xs mt-1 ${checkResult.broken > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {checkResult.broken === 0
                ? `✅ ${checkResult.checked} links OK`
                : `❌ ${checkResult.broken}/${checkResult.checked} quebrados`}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Cliques totais" value={(totals.total_clicks ?? 0).toLocaleString('pt-BR')} sub="em todos os links" />
        <StatCard label="Campanhas" value={totals.total_campaigns ?? '—'} sub="vídeos cadastrados" />
        <StatCard label="Links afiliados" value={totals.total_links ?? '—'} sub="produtos ativos" />
        <StatCard label="Perfis" value={totals.total_profiles ?? '—'} sub="canais cadastrados" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className={s.cardPad}>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Cliques por dispositivo</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : <BarChart rows={deviceRows} colorMap={DEVICE_COLORS} labelMap={DEVICE_LABELS} />}
        </div>
        <div className={s.cardPad}>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Cliques por plataforma</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : <BarChart rows={platformRows} colorMap={PLATFORM_COLORS} />}
        </div>
      </div>

      <div className={s.card}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-800 dark:text-gray-100">Top campanhas por cliques</h2>
        </div>
        {overview.isLoading ? (
          <p className={`px-6 py-8 ${s.textMuted} text-sm`}>Carregando...</p>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {topCampaigns.map((v: any, i: number) => (
              <div key={v.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <span className="text-sm font-bold text-gray-300 dark:text-gray-600 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{v.title}</p>
                  <p className={`text-xs ${s.textMuted} capitalize`}>{v.platform ?? 'sem plataforma'}</p>
                </div>
                <span className="text-sm font-semibold text-brand-600 dark:text-brand-400 shrink-0">
                  {(v.clicks ?? 0).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
            {topCampaigns.length === 0 && (
              <p className={`px-6 py-8 text-sm ${s.textMuted} text-center`}>Nenhuma campanha com cliques ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
