import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBrokenLinks, snoozeProduct, submitProductFeedback, cleanupBrokenLinks, BrokenLinkItem } from '../lib/api';
import { s } from '../lib/styles';
import ConfirmModal from '../components/ConfirmModal';

const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre', amazon: 'Amazon', shopee: 'Shopee',
  outros: 'Outros', affiliate: 'Afiliado',
};
const PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok',
  facebook: 'Facebook', x: 'X (Twitter)', other: 'Outro',
};

type TabId = 'all' | 'broken' | 'review';

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
  if (!iso) return <span className="text-gray-400 dark:text-gh-muted">—</span>;
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const label = mins < 1 ? 'agora mesmo' : mins < 60 ? `há ${mins}min` : hours < 24 ? `há ${hours}h` : `há ${days}d`;
  return <span title={date.toLocaleString('pt-BR')} className="text-gray-500 dark:text-gh-muted">{label}</span>;
}

function GeminiBadge({ status, confidence }: { status: string | null; confidence: number | null }) {
  if (!status) return null;
  const pct = confidence != null ? ` (${Math.round(confidence * 100)}%)` : '';
  if (status === 'ok')     return <span className="text-xs text-emerald-500">🤖 Gemini: disponível{pct}</span>;
  if (status === 'broken') return <span className="text-xs text-red-400">🤖 Gemini: quebrado{pct}</span>;
  return <span className="text-xs text-amber-400">🤖 Gemini: incerto{pct}</span>;
}

// ── Link Card ─────────────────────────────────────────────────────────────────

function LinkCard({ item, onFix, onSnoozed, onFeedback }: {
  item: BrokenLinkItem;
  onFix: () => void;
  onSnoozed: () => void;
  onFeedback: (v: 'ok' | 'broken') => void;
}) {
  const isReview = item.link_status === 'human_review';
  const isSnoozed = item.snoozed_until && new Date(item.snoozed_until) > new Date();
  const snoozeUntil = isSnoozed
    ? new Date(item.snoozed_until!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : null;

  const cardStyle = isReview
    ? 'border-orange-200 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/[0.04]'
    : isSnoozed
      ? 'border-gray-200 dark:border-white/[0.06] opacity-60'
      : 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/[0.04]';

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${cardStyle}`}>
      {/* Row 1: path */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-gh-text">{item.profile_name ?? 'Sem perfil'}</span>
            <span className="text-gray-400 dark:text-gh-muted">›</span>
            <span className="text-gray-600 dark:text-gh-muted truncate">{item.video_title ?? 'Sem campanha'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gh-muted flex-wrap">
            <span>{PLATFORM_LABELS[item.platform?.toLowerCase()] ?? item.platform ?? '—'}</span>
            <span>·</span>
            <span>{MARKETPLACE_LABELS[item.marketplace?.toLowerCase()] ?? item.marketplace ?? '—'}</span>
            {item.position && <><span>·</span><span>{item.position}</span></>}
          </div>
        </div>
        <div className="text-right shrink-0 text-xs">
          {isReview ? (
            <span className="text-orange-500 dark:text-orange-400 font-medium">🔍 Em revisão</span>
          ) : isSnoozed ? (
            <span className="text-gray-500 dark:text-gh-muted">🔕 Até {snoozeUntil}</span>
          ) : item.awaiting_confirmation ? (
            <span className="text-amber-600 dark:text-amber-400">⏳ Aguardando</span>
          ) : (
            <span className="text-red-500 dark:text-red-400">❌ Não notificado</span>
          )}
          <p className="text-xs mt-0.5"><RelativeTime iso={isReview ? item.link_last_checked_at : item.link_broken_at} /></p>
        </div>
      </div>

      {/* Row 2: error / gemini + URL */}
      <div className="space-y-1">
        {isReview ? (
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-medium text-orange-600 dark:text-orange-400">Verificação automática inconclusiva</p>
            <GeminiBadge status={item.last_gemini_status} confidence={item.last_gemini_confidence} />
          </div>
        ) : (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">{errorDescription(item.link_last_status_code)}</p>
        )}
        <a
          href={item.affiliate_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-brand-500 dark:text-brand-400 hover:underline break-all"
        >
          {item.affiliate_url}
        </a>
      </div>

      {/* Review explanation box */}
      {isReview && (
        <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg px-3 py-2 text-xs text-orange-700 dark:text-orange-300 leading-relaxed">
          O Playwright retornou resultado ambíguo e o Gemini não conseguiu determinar com certeza. Por favor, verifique manualmente se o produto ainda está disponível.
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap pt-0.5">
        {isReview ? (
          <>
            <button onClick={() => onFeedback('ok')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors">
              ✅ Marcar como OK
            </button>
            <button onClick={() => onFeedback('broken')}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg transition-colors">
              🔴 Marcar como Quebrado
            </button>
          </>
        ) : (
          <>
            <button onClick={onFix}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors">
              🔗 Corrigir agora
            </button>
            <button onClick={onSnoozed}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-300 dark:border-white/[0.12] text-gray-600 dark:text-gh-muted hover:text-gray-900 dark:hover:text-gh-text rounded-lg transition-colors">
              🔕 Ignorar 24h
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrokenLinks() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ['broken-links'],
    queryFn: getBrokenLinks,
    refetchInterval: 60_000,
  });

  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: cleanupBrokenLinks,
    onSuccess: (d) => {
      setShowCleanupModal(false);
      setCleanupMsg(`${d.removed} registro(s) inválido(s) removido(s).`);
      qc.invalidateQueries({ queryKey: ['broken-links'] });
      setTimeout(() => setCleanupMsg(null), 4000);
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: snoozeProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broken-links'] }),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ id, verdict }: { id: number; verdict: 'ok' | 'broken' }) =>
      submitProductFeedback(id, verdict),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broken-links'] }),
  });

  const brokenCount = data.filter((i) => i.link_status === 'broken').length;
  const reviewCount = data.filter((i) => i.link_status === 'human_review').length;

  const tabData: Record<TabId, BrokenLinkItem[]> = {
    all:    data,
    broken: data.filter((i) => i.link_status === 'broken'),
    review: data.filter((i) => i.link_status === 'human_review'),
  };

  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: 'all',    label: 'Todos',           count: data.length },
    { id: 'broken', label: 'Quebrado',         count: brokenCount },
    { id: 'review', label: 'Revisão humana',   count: reviewCount },
  ];

  const shown = tabData[activeTab];

  // Group by profile
  const groups = shown.reduce<Record<string, BrokenLinkItem[]>>((acc, item) => {
    const key = item.profile_name ?? 'Sem perfil';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className={`${s.page} max-w-3xl`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className={s.h1}>Links Quebrados</h1>
          <p className={s.sub}>Links com falha detectada pelo monitor ou verificação manual</p>
        </div>
        <button
          onClick={() => setShowCleanupModal(true)}
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 dark:border-white/[0.12] text-gray-600 dark:text-gh-muted hover:text-gray-900 dark:hover:text-gh-text hover:border-gray-400 dark:hover:border-white/[0.2] transition-colors"
        >
          🧹 Limpar registros
        </button>
      </div>

      {cleanupMsg && (
        <div className={`${s.alertSuccess} mb-4`}>{cleanupMsg}</div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 dark:bg-gh-over/60 rounded-lg p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gh-card text-gray-900 dark:text-gh-text shadow-sm'
                : 'text-gray-500 dark:text-gh-muted hover:text-gray-700 dark:hover:text-gh-text'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                activeTab === tab.id
                  ? tab.id === 'broken'
                    ? 'bg-red-500 text-white'
                    : tab.id === 'review'
                      ? 'bg-orange-500 text-white'
                      : 'bg-brand-500 text-white'
                  : 'bg-gray-200 dark:bg-gh-over text-gray-600 dark:text-gh-muted'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading && <p className={`${s.textMuted} text-sm`}>Carregando...</p>}

      {!isLoading && data.length === 0 && (
        <div className={`${s.cardPad} text-center`}>
          <p className="text-4xl mb-3">✅</p>
          <p className="font-semibold text-gray-700 dark:text-gh-text">Nenhum link quebrado detectado</p>
          <p className={`text-sm ${s.textMuted} mt-1`}>
            O monitor verifica automaticamente. Use "Verificar agora" nas Configurações para testar manualmente.
          </p>
        </div>
      )}

      {!isLoading && shown.length === 0 && data.length > 0 && (
        <div className={`${s.cardPad} text-center`}>
          <p className={`${s.textMuted} text-sm`}>Nenhum item nesta categoria.</p>
        </div>
      )}

      {!isLoading && Object.entries(groups).map(([profileName, items]) => (
        <div key={profileName} className="mb-8">
          <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gh-muted uppercase tracking-wide mb-3">
            <span>👤 {profileName}</span>
            <span className="normal-case text-red-500 font-bold">({items.length})</span>
          </h2>
          <div className="space-y-3">
            {items.map((item) => (
              <LinkCard
                key={item.id}
                item={item}
                onFix={() => navigate(`/admin/campaigns/${item.video_id}?fix=${item.id}`)}
                onSnoozed={() => snoozeMutation.mutate(item.id)}
                onFeedback={(verdict) => feedbackMutation.mutate({ id: item.id, verdict })}
              />
            ))}
          </div>
        </div>
      ))}

      {showCleanupModal && (
        <ConfirmModal
          title="Limpar registros inválidos?"
          body="Remove produtos órfãos (sem campanha) e registros de plataformas que não são mais monitoradas. Esta ação não pode ser desfeita."
          confirmLabel="Sim, limpar"
          danger
          isPending={cleanupMutation.isPending}
          onConfirm={() => cleanupMutation.mutate()}
          onCancel={() => setShowCleanupModal(false)}
        />
      )}
    </div>
  );
}
