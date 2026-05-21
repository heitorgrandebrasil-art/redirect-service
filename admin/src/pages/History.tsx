import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getHistoryStats, getHistorySize, deleteHistoryAll,
} from '../lib/api';
import { s } from '../lib/styles';

function statusBadge(v: string | null) {
  if (!v) return <span className={s.textMuted}>—</span>;
  const styles: Record<string, string> = {
    ok:        'text-green-600 dark:text-green-400',
    broken:    'text-red-600 dark:text-red-400',
    uncertain: 'text-amber-600 dark:text-amber-400',
  };
  const labels: Record<string, string> = { ok: '✅ OK', broken: '❌ Quebrado', uncertain: '❓ Incerto' };
  return (
    <span className={`text-xs font-medium ${styles[v] ?? s.textSecondary}`}>
      {labels[v] ?? v}
    </span>
  );
}

interface SummaryCard {
  label: string;
  value: string | number;
  color: string;
  bg: string;
}

export default function History() {
  const qc = useQueryClient();
  const statsQ = useQuery({ queryKey: ['history-stats'], queryFn: getHistoryStats });
  const sizeQ  = useQuery({ queryKey: ['history-size'],  queryFn: getHistorySize });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cleanupMsg,      setCleanupMsg]      = useState<{ ok: boolean; text: string } | null>(null);

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

  // Fill last 30 days even when there's no data for a day
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

  const cards: SummaryCard[] = [
    {
      label: 'Verificações no mês',
      value: summary?.total_checked ?? '—',
      color: 'text-gray-700 dark:text-gray-200',
      bg:    'bg-gray-50 dark:bg-gray-800/60',
    },
    {
      label: 'Links verificados OK',
      value: summary?.total_ok ?? '—',
      color: 'text-green-700 dark:text-green-400',
      bg:    'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Quebrados detectados',
      value: summary?.total_broken ?? '—',
      color: 'text-red-700 dark:text-red-400',
      bg:    'bg-red-50 dark:bg-red-900/20',
    },
    {
      label: 'Revisões pendentes',
      value: summary?.pending_human_review ?? '—',
      color: 'text-orange-700 dark:text-orange-400',
      bg:    'bg-orange-50 dark:bg-orange-900/20',
    },
    {
      label: 'Chamadas ao Gemini',
      value: summary?.gemini_calls ?? '—',
      color: 'text-purple-700 dark:text-purple-400',
      bg:    'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Acerto do Gemini',
      value: summary?.gemini_accuracy != null ? `${summary.gemini_accuracy}%` : '—',
      color: 'text-blue-700 dark:text-blue-400',
      bg:    'bg-blue-50 dark:bg-blue-900/20',
    },
  ];

  const monthLabel = statsQ.data?.month
    ? new Date(statsQ.data.month + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className={`${s.page} max-w-7xl`}>
      <div className="mb-6">
        <h1 className={s.h1}>Histórico de Verificações</h1>
        {monthLabel && <p className={s.sub}>Resumo de {monthLabel}</p>}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {cards.map((c) => (
          <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-1`}>
            <span className={`text-2xl font-bold ${c.color}`}>{c.value}</span>
            <span className={`text-xs ${s.textMuted} leading-tight`}>{c.label}</span>
          </div>
        ))}
      </div>

      {/* Line chart */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Verificações nos últimos 30 dias</h2>
        {statsQ.isLoading ? (
          <p className={`text-sm ${s.textMuted}`}>Carregando...</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.2)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickLine={false}
                interval={4}
                className="text-gray-500 dark:text-gray-400"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickLine={false}
                axisLine={false}
                className="text-gray-500 dark:text-gray-400"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--tooltip-bg, #1f2937)',
                  border: '1px solid rgba(75,85,99,0.4)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#f9fafb',
                }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(v) => [v, 'Verificações']}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Records table */}
      <section className={`${s.tableWrap} mb-6`}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
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
                {statsQ.data.records.map((r) => (
                  <tr key={r.id} className={s.tr}>
                    <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                      {new Date(r.checked_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300 capitalize whitespace-nowrap">
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
                    <td className="px-4 py-2.5 whitespace-nowrap">{statusBadge(r.playwright_status)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{statusBadge(r.gemini_status)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{statusBadge(r.final_status)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{statusBadge(r.human_feedback)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Cleanup section */}
      <section className={s.cardPad}>
        <h2 className={`font-semibold ${s.textPrimary} mb-3`}>Gerenciar histórico</h2>

        {sizeQ.data && (
          <p className={`text-sm ${s.textMuted} mb-4`}>
            Histórico ocupa {sizeQ.data.total_mb} MB ({sizeQ.data.history_rows.toLocaleString('pt-BR')} verificações)
          </p>
        )}

        <button onClick={() => setShowDeleteModal(true)} className={s.btnSecondary}>
          🗑️ Limpar histórico
        </button>

        {cleanupMsg && (
          <div className={`mt-3 ${cleanupMsg.ok ? s.alertSuccess : s.alertError}`}>
            {cleanupMsg.text}
          </div>
        )}
      </section>

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Apagar todo o histórico?</h2>
            </div>
            <div className={s.modalBody}>
              <p className={`text-sm ${s.textSecondary} leading-relaxed`}>
                Isso vai apagar todos os registros de verificações anteriores.
                Os seus links continuam funcionando normalmente — só o histórico
                de checagens vai ser removido.
              </p>
            </div>
            <div className={s.modalFooter}>
              <button onClick={() => setShowDeleteModal(false)} className={s.btnSecondary}>
                Cancelar
              </button>
              <button
                onClick={() => deleteAll.mutate()}
                disabled={deleteAll.isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {deleteAll.isPending ? 'Apagando...' : 'Sim, apagar tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
