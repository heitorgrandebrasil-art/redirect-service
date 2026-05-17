import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBrokenLinks, snoozeProduct, BrokenLinkItem } from '../lib/api';
import { s } from '../lib/styles';

const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee',
  outros: 'Outros', affiliate: 'Afiliado',
};
const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok',
  facebook: 'Facebook', x: 'X (Twitter)', other: 'Outro',
};

function errorDescription(code: number | null) {
  if (!code) return 'Sem resposta / timeout';
  if (code === 404) return 'Página não encontrada (404)';
  if (code === 410) return 'Produto removido (410)';
  if (code === 503) return 'Serviço indisponível (503)';
  if (code >= 500) return `Erro do servidor (${code})`;
  if (code >= 400) return `Erro HTTP ${code}`;
  return `HTTP ${code}`;
}

function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-400">—</span>;
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  let label = mins < 1 ? 'agora mesmo' : mins < 60 ? `há ${mins}min` : hours < 24 ? `há ${hours}h` : `há ${days}d`;
  return <span title={date.toLocaleString('pt-BR')}>{label}</span>;
}

function LinkCard({ item, onFix, onSnoozed }: {
  item: BrokenLinkItem;
  onFix: () => void;
  onSnoozed: () => void;
}) {
  const isSnoozed = item.snoozed_until && new Date(item.snoozed_until) > new Date();
  const snoozeUntil = isSnoozed ? new Date(item.snoozed_until!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : null;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isSnoozed ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 opacity-60' : 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`font-semibold ${s.textPrimary}`}>{item.profile_name ?? 'Sem perfil'}</span>
            <span className={s.textMuted}>›</span>
            <span className={s.textSecondary}>{item.video_title ?? 'Sem campanha'}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-gray-500">{PLATFORM_LABELS[item.platform?.toLowerCase()] ?? item.platform ?? '—'}</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">{MARKETPLACE_LABELS[item.marketplace?.toLowerCase()] ?? item.marketplace ?? '—'}</span>
            {item.position && <><span className="text-gray-400">·</span><span className="text-gray-500">{item.position}</span></>}
          </div>
        </div>
        <div className="text-right shrink-0 text-xs space-y-0.5">
          {isSnoozed ? (
            <span className="text-gray-500 dark:text-gray-400">🔕 Até {snoozeUntil}</span>
          ) : item.awaiting_confirmation ? (
            <span className="text-amber-600 dark:text-amber-400">⏳ Aguardando confirmação</span>
          ) : (
            <span className="text-red-600 dark:text-red-400">❌ Não notificado ainda</span>
          )}
          <p className={`${s.textMuted}`}><RelativeTime iso={item.link_broken_at} /></p>
        </div>
      </div>

      {/* Link row */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-red-700 dark:text-red-400">
          {errorDescription(item.link_last_status_code)}
        </p>
        <a
          href={item.affiliate_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline break-all"
        >
          {item.affiliate_url}
        </a>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onFix} className={`${s.btnPrimary} text-xs py-1.5 px-3`}>
          🔗 Corrigir agora
        </button>
        <button onClick={onSnoozed} className={`${s.btnSecondary} text-xs py-1.5 px-3`}>
          🔕 Ignorar 24h
        </button>
      </div>
    </div>
  );
}

export default function BrokenLinks() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ['broken-links'],
    queryFn: getBrokenLinks,
    refetchInterval: 60_000,
  });

  const [profileFilter, setProfileFilter] = useState('');

  const snoozeMutation = useMutation({
    mutationFn: snoozeProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broken-links'] }),
  });

  // Unique profile names for filter
  const profiles = [...new Set(data.map((i) => i.profile_name ?? 'Sem perfil'))].sort();
  const filtered = profileFilter ? data.filter((i) => (i.profile_name ?? 'Sem perfil') === profileFilter) : data;

  // Group by profile
  const groups = filtered.reduce<Record<string, BrokenLinkItem[]>>((acc, item) => {
    const key = item.profile_name ?? 'Sem perfil';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className={`${s.page} max-w-3xl`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className={s.h1}>
            Links Quebrados
            {data.length > 0 && (
              <span className="ml-3 text-base font-semibold text-red-600 dark:text-red-400">
                ({data.length})
              </span>
            )}
          </h1>
          <p className={s.sub}>Links com falha detectada pelo monitor ou verificação manual</p>
        </div>
        {profiles.length > 1 && (
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className={`${s.select} w-48 shrink-0`}
          >
            <option value="">Todos os perfis</option>
            {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {isLoading && <p className={`${s.textMuted} text-sm`}>Carregando...</p>}

      {!isLoading && data.length === 0 && (
        <div className={`${s.cardPad} text-center`}>
          <p className="text-4xl mb-3">✅</p>
          <p className="font-medium text-gray-700 dark:text-gray-300">Nenhum link quebrado detectado</p>
          <p className={`text-sm ${s.textMuted} mt-1`}>
            O monitor verifica automaticamente. Use "Verificar agora" nas Configurações para testar manualmente.
          </p>
        </div>
      )}

      {!isLoading && Object.entries(groups).map(([profileName, items]) => (
        <div key={profileName} className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            👤 {profileName}
            <span className="ml-2 normal-case text-red-500 dark:text-red-400">({items.length})</span>
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <LinkCard
                key={item.id}
                item={item}
                onFix={() => navigate(`/admin/campaigns/${item.video_id}?fix=${item.id}`)}
                onSnoozed={() => snoozeMutation.mutate(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
