import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview } from '../lib/api';
import { s } from '../lib/styles';

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#6366f1', mobile: '#10b981', tablet: '#f59e0b', unknown: '#9ca3af',
};
const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', unknown: 'Desconhecido',
};
const PLATFORM_COLORS: Record<string, string> = {
  youtube: '#ef4444', instagram: '#ec4899', tiktok: '#1e293b',
  facebook: '#3b82f6', x: '#4b5563', outros: '#a78bfa', other: '#a78bfa',
};
const STATUS_COLORS: Record<string, string> = {
  ok: '#10b981', broken: '#ef4444', unknown: '#9ca3af', snoozed: '#f59e0b',
};
const STATUS_LABELS: Record<string, string> = {
  ok: 'OK', broken: 'Quebrado', unknown: 'Desconhecido', snoozed: 'Adiado',
};

const CHART_AXIS = '#9ca3af';
const CHART_GRID = 'rgba(156,163,175,0.15)';

function StatCard({ label, value, sub, highlight }: {
  label: string; value: string | number; sub?: string; highlight?: 'red' | 'green';
}) {
  const valueClass = highlight === 'red'
    ? 'text-red-500 dark:text-red-400'
    : highlight === 'green'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-gray-900 dark:text-white';
  return (
    <div className={s.cardPad}>
      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueClass}`}>{value}</p>
      {sub && <p className={`${s.hint} mt-1`}>{sub}</p>}
    </div>
  );
}

function EmptyChart() {
  return <p className={`${s.textMuted} text-sm text-center py-8`}>Sem dados ainda</p>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white shadow-lg">
      {label && <p className="text-gray-400 mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}: <span className="font-semibold">{p.value?.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  );
}

function PieCustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white shadow-lg">
      <p style={{ color: p.payload.fill }}>{p.name}: <span className="font-semibold">{p.value?.toLocaleString('pt-BR')}</span></p>
    </div>
  );
}

export default function Dashboard() {
  const overview = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: getAnalyticsOverview,
    refetchInterval: 60_000,
  });

  const data = overview.data;
  const totals = data?.totals ?? {
    total_clicks: 0, total_campaigns: 0, total_links: 0,
    total_profiles: 0, links_ok: 0, links_broken: 0,
  };

  const byDay: { date: string; clicks: number }[] = data?.byDay ?? [];
  const byDayFormatted = byDay.map((r) => ({
    ...r,
    label: new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }));

  const deviceData = (data?.byDevice ?? []).map((r: any) => ({
    name: DEVICE_LABELS[r.device] ?? r.device,
    value: r.clicks,
    fill: DEVICE_COLORS[r.device] ?? '#9ca3af',
  }));

  const linkStatusData = (data?.linkStatus ?? []).map((r: any) => ({
    name: STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
    fill: STATUS_COLORS[r.status] ?? '#9ca3af',
  }));

  const topCampaigns = (data?.topCampaigns ?? []).map((v: any) => ({
    name: v.title.length > 28 ? v.title.slice(0, 28) + '…' : v.title,
    clicks: v.clicks,
  }));

  const linksOk = Number(totals.links_ok ?? 0);
  const linksBroken = Number(totals.links_broken ?? 0);

  return (
    <div className={s.page}>
      <div className="mb-8">
        <h1 className={s.h1}>Dashboard</h1>
        <p className={s.sub}>Atualiza a cada minuto</p>
      </div>

      {/* 6 stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Cliques totais" value={(totals.total_clicks ?? 0).toLocaleString('pt-BR')} sub="em todos os links" />
        <StatCard label="Campanhas" value={totals.total_campaigns ?? '—'} sub="vídeos cadastrados" />
        <StatCard label="Links ativos" value={totals.total_links ?? '—'} sub="produtos cadastrados" />
        <StatCard label="Perfis" value={totals.total_profiles ?? '—'} sub="canais cadastrados" />
        <StatCard
          label="Links OK"
          value={linksOk}
          sub="verificados e ok"
          highlight={linksOk > 0 ? 'green' : undefined}
        />
        <StatCard
          label="Links quebrados"
          value={linksBroken}
          sub={linksBroken > 0 ? 'requer atenção' : 'nenhum problema'}
          highlight={linksBroken > 0 ? 'red' : undefined}
        />
      </div>

      {/* Line chart: clicks by day */}
      <div className={`${s.cardPad} mb-6`}>
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Cliques — últimos 30 dias</h2>
        {overview.isLoading
          ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
          : byDayFormatted.every((d) => d.clicks === 0)
            ? <EmptyChart />
            : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={byDayFormatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: CHART_AXIS }}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_AXIS }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    name="Cliques"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#6366f1' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className={s.cardPad}>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Cliques por dispositivo</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : deviceData.length === 0 || deviceData.every((d) => d.value === 0)
              ? <EmptyChart />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={deviceData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {deviceData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieCustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ fontSize: 12, color: CHART_AXIS }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
        </div>

        <div className={s.cardPad}>
          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Status dos links</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : linkStatusData.length === 0
              ? <EmptyChart />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={linkStatusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {linkStatusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieCustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ fontSize: 12, color: CHART_AXIS }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
        </div>
      </div>

      {/* Top campaigns horizontal bar */}
      <div className={s.cardPad}>
        <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Top campanhas por cliques</h2>
        {overview.isLoading
          ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
          : topCampaigns.length === 0 || topCampaigns.every((c) => c.clicks === 0)
            ? <EmptyChart />
            : (
              <ResponsiveContainer width="100%" height={topCampaigns.length * 44 + 16}>
                <BarChart
                  data={topCampaigns}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: CHART_AXIS }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 12, fill: CHART_AXIS }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                  <Bar dataKey="clicks" name="Cliques" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            )}
      </div>
    </div>
  );
}
