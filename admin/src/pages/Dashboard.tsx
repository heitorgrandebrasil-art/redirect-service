import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { getAnalyticsOverview } from '../lib/api';
import { s } from '../lib/styles';
import MetricCard from '../components/MetricCard';

// ── Icon helpers ──────────────────────────────────────────────────────────────

function IcClick() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  );
}
function IcFilm() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" /><line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}
function IcLink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function IcUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IcCheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IcAlertOctagon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
      <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#6366f1', mobile: '#10b981', tablet: '#f59e0b', unknown: '#4b5563',
};
const DEVICE_LABELS: Record<string, string> = {
  desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', unknown: 'Desconhecido',
};
const STATUS_COLORS: Record<string, string> = {
  ok: '#10b981', broken: '#ef4444', human_review: '#f97316', unknown: '#4b5563', snoozed: '#f59e0b',
};
const STATUS_LABELS: Record<string, string> = {
  ok: 'OK', broken: 'Quebrado', human_review: 'Em revisão', unknown: 'Desconhecido', snoozed: 'Adiado',
};

const AXIS_COLOR = '#7d8590';
const GRID_COLOR = 'rgba(125,133,144,0.12)';

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gh-over border border-white/[0.12] rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-gh-muted mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey ?? p.name} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}: <span className="font-semibold">{p.value?.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-gh-over border border-white/[0.12] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p style={{ color: p.payload.fill }}>{p.name}: <span className="font-semibold">{p.value?.toLocaleString('pt-BR')}</span></p>
    </div>
  );
}

function Empty() {
  return <p className="text-gh-muted text-sm text-center py-10">Sem dados ainda</p>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

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

  const byDayFormatted = (data?.byDay ?? []).map((r: any) => ({
    ...r,
    label: new Date(r.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }));

  const deviceData = (data?.byDevice ?? []).map((r: any) => ({
    name: DEVICE_LABELS[r.device] ?? r.device,
    value: r.clicks,
    fill: DEVICE_COLORS[r.device] ?? '#4b5563',
  }));

  const linkStatusData = (data?.linkStatus ?? []).map((r: any) => ({
    name: STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
    fill: STATUS_COLORS[r.status] ?? '#4b5563',
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

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <div className="stagger-1">
          <MetricCard label="Cliques totais" value={totals.total_clicks ?? 0} sub="em todos os links" icon={<IcClick />} />
        </div>
        <div className="stagger-2">
          <MetricCard label="Campanhas" value={totals.total_campaigns ?? 0} sub="vídeos cadastrados" icon={<IcFilm />} />
        </div>
        <div className="stagger-3">
          <MetricCard label="Links ativos" value={totals.total_links ?? 0} sub="produtos cadastrados" icon={<IcLink />} />
        </div>
        <div className="stagger-4">
          <MetricCard label="Perfis" value={totals.total_profiles ?? 0} sub="canais cadastrados" icon={<IcUsers />} />
        </div>
        <div className="stagger-5">
          <MetricCard
            label="Links OK"
            value={linksOk}
            sub="verificados e OK"
            icon={<IcCheckCircle />}
            variant={linksOk > 0 ? 'success' : 'default'}
          />
        </div>
        <div className="stagger-6">
          <MetricCard
            label="Quebrados"
            value={linksBroken}
            sub={linksBroken > 0 ? 'requer atenção' : 'nenhum problema'}
            icon={<IcAlertOctagon />}
            variant={linksBroken > 0 ? 'danger' : 'default'}
          />
        </div>
      </div>

      {/* Line chart */}
      <div className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Cliques — últimos 30 dias</h2>
        {overview.isLoading
          ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
          : byDayFormatted.every((d: any) => d.clicks === 0)
            ? <Empty />
            : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={byDayFormatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_COLOR }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_COLOR }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="clicks" name="Cliques" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
      </div>

      {/* Pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className={s.cardPad}>
          <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Cliques por dispositivo</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : deviceData.length === 0 || deviceData.every((d: any) => d.value === 0)
              ? <Empty />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={deviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                      {deviceData.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: AXIS_COLOR }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
        </div>

        <div className={s.cardPad}>
          <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Status dos links</h2>
          {overview.isLoading
            ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
            : linkStatusData.length === 0
              ? <Empty />
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={linkStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={2}>
                      {linkStatusData.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: AXIS_COLOR }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
        </div>
      </div>

      {/* Top campaigns bar */}
      <div className={s.cardPad}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Campanhas populares</h2>
        {overview.isLoading
          ? <p className={`${s.textMuted} text-sm`}>Carregando...</p>
          : topCampaigns.length === 0 || topCampaigns.every((c: any) => c.clicks === 0)
            ? <Empty />
            : (
              <ResponsiveContainer width="100%" height={topCampaigns.length * 44 + 16}>
                <BarChart data={topCampaigns} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_COLOR }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={164} tick={{ fontSize: 12, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
                  <Bar dataKey="clicks" name="Cliques" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
      </div>
    </div>
  );
}
