import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getHistoryStats, getHistorySize, getHistoryRetention, setHistoryRetention,
  deleteHistoryPreviousMonth, deleteHistoryAll,
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
  const statsQ    = useQuery({ queryKey: ['history-stats'],     queryFn: getHistoryStats });
  const sizeQ     = useQuery({ queryKey: ['history-size'],      queryFn: getHistorySize });
  const retentionQ = useQuery({ queryKey: ['history-retention'], queryFn: getHistoryRetention });

  const [retention,      setRetention]      = useState(6);
  const [deleteConfirm,  setDeleteConfirm]  = useState<'prev' | 'all' | null>(null);
  const [cleanupMsg,     setCleanupMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (retentionQ.data) setRetention(retentionQ.data.months);
  }, [retentionQ.data]);

  const deletePrev = useMutation({
    mutationFn: deleteHistoryPreviousMonth,
    onSuccess: (d) => {
      setDeleteConfirm(null);
      setCleanupMsg({ ok: true, text: `Histórico de ${d.month} apagado (${d.deleted_checks} registros).` });
      qc.invalidateQueries({ queryKey: ['history-size'] });
      qc.invalidateQueries({ queryKey: ['history-stats'] });
    },
    onError: () => setCleanupMsg({ ok: false, text: 'Erro ao apagar histórico.' }),
  });

  const deleteAll = useMutation({
    mutationFn: deleteHistoryAll,
    onSuccess: (d) => {
      setDeleteConfirm(null);
      setCleanupMsg({ ok: true, text: `Todo o histórico apagado (${d.deleted_checks} registros).` });
      qc.invalidateQueries({ queryKey: ['history-size'] });
      qc.invalidateQueries({ queryKey: ['history-stats'] });
    },
    onError: () => setCleanupMsg({ ok: false, text: 'Erro ao apagar histórico.' }),
  });

  const saveRetention = useMutation({
    mutationFn: () => setHistoryRetention(retention),
    onSuccess: () => {
      setCleanupMsg({ ok: true, text: 'Retenção atualizada.' });
      qc.invalidateQueries({ queryKey: ['history-retention'] });
      setTimeout(() => setCleanupMsg(null), 2500);
    },
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
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Gerenciar histórico</h2>

        {sizeQ.data && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <span className="text-2xl">🗄️</span>
            <div>
              <p className={`text-sm font-medium ${s.textPrimary}`}>
                Tamanho atual: {sizeQ.data.total_mb} MB
              </p>
              <p className={`text-xs ${s.textMuted}`}>
                {sizeQ.data.history_rows.toLocaleString('pt-BR')} verificações · {sizeQ.data.cycles_rows} ciclos mensais
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className={s.label}>Retenção automática</label>
            <div className="flex gap-2 items-center">
              <select
                value={retention}
                onChange={(e) => setRetention(Number(e.target.value))}
                className={`${s.select} flex-1`}
              >
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>1 ano</option>
                <option value={0}>Sempre (sem limpeza automática)</option>
              </select>
              <button
                onClick={() => saveRetention.mutate()}
                disabled={saveRetention.isPending}
                className={s.btnSecondary}
              >
                {saveRetention.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {deleteConfirm !== 'prev' ? (
              <button onClick={() => setDeleteConfirm('prev')} className={s.btnSecondary}>
                Apagar histórico do mês anterior
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-xs ${s.textSecondary}`}>Confirmar exclusão do mês anterior?</span>
                <button
                  onClick={() => deletePrev.mutate()}
                  disabled={deletePrev.isPending}
                  className={`${s.btnDanger} text-xs py-1 px-2`}
                >
                  Sim, apagar
                </button>
                <button onClick={() => setDeleteConfirm(null)} className={`${s.btnSecondary} text-xs py-1 px-2`}>
                  Cancelar
                </button>
              </div>
            )}

            {deleteConfirm !== 'all' ? (
              <button onClick={() => setDeleteConfirm('all')} className={s.btnDanger}>
                Apagar todo o histórico
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-xs ${s.textSecondary}`}>Confirmar exclusão total?</span>
                <button
                  onClick={() => deleteAll.mutate()}
                  disabled={deleteAll.isPending}
                  className={`${s.btnDanger} text-xs py-1 px-2`}
                >
                  Sim, apagar tudo
                </button>
                <button onClick={() => setDeleteConfirm(null)} className={`${s.btnSecondary} text-xs py-1 px-2`}>
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {cleanupMsg && (
            <div className={cleanupMsg.ok ? s.alertSuccess : s.alertError}>
              {cleanupMsg.text}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
