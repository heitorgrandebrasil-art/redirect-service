import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getHistoryStats, getHistorySize, deleteHistoryAll } from '../lib/api';
import { s } from '../lib/styles';
import MetricCard from '../components/MetricCard';
import ConfirmModal from '../components/ConfirmModal';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IcCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IcX() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IcClock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IcCpu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
      <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
    </svg>
  );
}
function IcTarget() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IcHash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

// ── Status badge for table ────────────────────────────────────────────────────

function StatusPill({ v }: { v: string | null }) {
  if (!v) return <span className="text-gray-400 dark:text-gh-muted text-xs">—</span>;
  const map: Record<string, string> = {
    ok:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    broken:    'bg-red-500/10 text-red-400 border-red-500/20',
    uncertain: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  const labels: Record<string, string> = { ok: 'OK', broken: 'Quebrado', uncertain: 'Incerto' };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border ${map[v] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
      {labels[v] ?? v}
    </span>
  );
}

// Special badge: Gemini recovered (playwright=broken, final=ok)
function RecoveredBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-teal-500/10 text-teal-400 border-teal-500/20">
      🤖 GEMINI_RECOVERED
    </span>
  );
}

const AXIS_COLOR = '#7d8590';
const GRID_COLOR = 'rgba(125,133,144,0.12)';

// ── History ───────────────────────────────────────────────────────────────────

export default function History() {
  const qc = useQueryClient();
  const statsQ = useQuery({ queryKey: ['history-stats'], queryFn: getHistoryStats });
  const sizeQ  = useQuery({ queryKey: ['history-size'],  queryFn: getHistorySize });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const deleteAll = useMutation({
    mutationFn: deleteHistoryAll,
    onSuccess: () => {
      setShowDeleteModal(false);
      setCleanupMsg({ ok: true, text: '✅ Histórico apagado! Os registros começam do zero agora.' });
      qc.invalidateQueries({ queryKey: ['history-size'] });
      qc.invalidateQueries({ queryKey: ['history-stats'] });
      setTimeout(() => setCleanupMsg(null), 5000);
    },
    onError: () => setCleanupMsg({ ok: false, text: '❌ Não foi possível apagar o histórico. Tente de novo.' }),
  });

  const chartData = useMemo(() => {
    const map = new Map((statsQ.data?.daily ?? []).map((d) => [d.day, d.total]));
    return Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      const key   = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      return { day: label, total: map.get(key) ?? 0 };
    });
  }, [statsQ.data]);

  const summary = statsQ.data?.summary;

  const monthLabel = statsQ.data?.month
    ? new Date(statsQ.data.month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className={`${s.page} max-w-7xl`}>
      <div className="mb-6">
        <h1 className={s.h1}>Histórico de Verificações</h1>
        {monthLabel && <p className={s.sub}>Resumo de {monthLabel}</p>}
      </div>

      {/* Summary metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div className="stagger-1">
          <MetricCard label="Verificadas no mês" value={summary?.total_checked ?? 0} icon={<IcHash />} />
        </div>
        <div className="stagger-2">
          <MetricCard label="Links OK" value={summary?.total_ok ?? 0} icon={<IcCheck />} variant="success" />
        </div>
        <div className="stagger-3">
          <MetricCard label="Quebrados" value={summary?.total_broken ?? 0} icon={<IcX />} variant="danger" />
        </div>
        <div className="stagger-4">
          <MetricCard label="Em revisão" value={summary?.pending_human_review ?? 0} icon={<IcClock />} variant="warning" />
        </div>
        <div className="stagger-5">
          <MetricCard label="Chamadas Gemini" value={summary?.gemini_calls ?? 0} icon={<IcCpu />} variant="purple" />
        </div>
        <div className="stagger-6">
          <MetricCard
            label="Acerto do Gemini"
            value={summary?.gemini_accuracy != null ? `${summary.gemini_accuracy}%` : '—'}
            icon={<IcTarget />}
            variant="purple"
          />
        </div>
      </div>

      {/* Line chart */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Verificações nos últimos 30 dias</h2>
        {statsQ.isLoading ? (
          <p className={`text-sm ${s.textMuted}`}>Carregando...</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: AXIS_COLOR }} tickLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#21262d',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#e6edf3',
                }}
                labelStyle={{ color: '#7d8590' }}
                formatter={(v) => [v, 'Verificações']}
              />
              <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Records table */}
      <section className={`${s.tableWrap} mb-6`}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-white/[0.08]">
          <h2 className={`font-semibold ${s.textPrimary}`}>Últimos 50 registros</h2>
        </div>
        {statsQ.isLoading ? (
          <p className={`text-sm ${s.textMuted} p-6`}>Carregando...</p>
        ) : !statsQ.data?.records.length ? (
          <p className={`text-sm ${s.textMuted} p-6`}>Nenhum registro ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={s.thead}>
                <tr>
                  <th className={s.th}>Data/hora</th>
                  <th className={s.th}>Marketplace</th>
                  <th className={s.th}>Link</th>
                  <th className={s.th}>Playwright</th>
                  <th className={s.th}>Gemini</th>
                  <th className={s.th}>Resultado</th>
                  <th className={s.th}>Feedback humano</th>
                </tr>
              </thead>
              <tbody className={s.tdDiv}>
                {statsQ.data.records.map((r) => {
                  const geminiRecovered = r.playwright_status === 'broken' && r.final_status === 'ok';
                  return (
                    <tr key={r.id} className={s.tr}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-gh-muted">
                        {new Date(r.checked_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gh-muted capitalize whitespace-nowrap">
                        {r.marketplace ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 max-w-[220px]">
                        <p className={`text-xs font-medium ${s.textPrimary} truncate`} title={r.url}>
                          {r.product_title ?? r.url}
                        </p>
                        {r.product_title && (
                          <p className={`text-xs ${s.textMuted} truncate`} title={r.url}>{r.url}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusPill v={r.playwright_status} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusPill v={r.gemini_status} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {geminiRecovered ? <RecoveredBadge /> : <StatusPill v={r.final_status} />}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusPill v={r.human_feedback} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manage section */}
      <section className={s.cardPad}>
        <h2 className={`font-semibold ${s.textPrimary} mb-3`}>Gerenciar histórico</h2>

        {sizeQ.data && (
          <p className={`text-sm ${s.textMuted} mb-4`}>
            Histórico ocupa <strong className={s.textSecondary}>{sizeQ.data.total_mb} MB</strong> — {sizeQ.data.history_rows.toLocaleString('pt-BR')} verificações
          </p>
        )}

        <button onClick={() => setShowDeleteModal(true)} className={s.btnSecondary}>
          🗑️ Apagar todo o histórico
        </button>

        {cleanupMsg && (
          <div className={`mt-3 ${cleanupMsg.ok ? s.alertSuccess : s.alertError}`}>{cleanupMsg.text}</div>
        )}
      </section>

      {showDeleteModal && (
        <ConfirmModal
          title="Apagar todo o histórico?"
          body="Isso vai apagar todos os registros de verificações anteriores. Os seus links continuam funcionando normalmente — só o histórico de checagens vai ser removido."
          confirmLabel="Sim, apagar tudo"
          danger
          isPending={deleteAll.isPending}
          onConfirm={() => deleteAll.mutate()}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
