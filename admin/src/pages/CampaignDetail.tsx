import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getVideo, listVideoProducts, createVideoProduct, deleteProduct, replaceProductLink,
  markProductFixed, listDomains, getConfig, checkVideoLinks, type ProductPayload
} from '../lib/api';
import { s } from '../lib/styles';

const MARKETPLACES = [
  { key: 'mercadolivre', label: 'Mercado Livre',  prefix: 'ml',  color: 'text-yellow-600 dark:text-yellow-400',  bg: 'bg-yellow-50 dark:bg-yellow-900/20',  border: 'border-yellow-200 dark:border-yellow-800' },
  { key: 'amazon',       label: 'Amazon',          prefix: 'amz', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20',  border: 'border-orange-200 dark:border-orange-800' },
  { key: 'shopee',       label: 'Shopee',          prefix: 'shp', color: 'text-orange-500 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20',  border: 'border-orange-200 dark:border-orange-800' },
  { key: 'outros',       label: 'Outros',          prefix: 'out', color: 'text-gray-600 dark:text-gray-400',     bg: 'bg-gray-50 dark:bg-gray-700/30',       border: 'border-gray-200 dark:border-gray-700' },
] as const;

type MarketplaceKey = typeof MARKETPLACES[number]['key'];

const EMPTY = (marketplace: MarketplaceKey): ProductPayload => ({
  title: '', affiliate_url: '', marketplace, position: '', domain_id: null,
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={copy} className={`text-xs ${s.textMuted} hover:text-brand-600 dark:hover:text-brand-400 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700`}>
      {copied ? '✓' : 'Copiar'}
    </button>
  );
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const videoId = Number(id);
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fixProductId = Number(searchParams.get('fix')) || null;

  const video    = useQuery({ queryKey: ['video', videoId],         queryFn: () => getVideo(videoId) });
  const products = useQuery({ queryKey: ['video-products', videoId], queryFn: () => listVideoProducts(videoId) });
  const domains  = useQuery({ queryKey: ['domains'],                queryFn: listDomains });
  const config   = useQuery({ queryKey: ['config'],                 queryFn: getConfig, staleTime: Infinity });

  const [showAdd, setShowAdd]       = useState(false);
  const [addMkt, setAddMkt]         = useState<MarketplaceKey>('mercadolivre');
  const [form, setForm]             = useState<ProductPayload>(EMPTY('mercadolivre'));
  const [addError, setAddError]     = useState('');

  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [newUrl, setNewUrl]           = useState('');
  const [replaceError, setReplaceError] = useState('');

  const [justFixedId, setJustFixedId] = useState<number | null>(null);

  const [checkResult, setCheckResult] = useState<null | {
    checked: number; broken: number;
    results: { id: number; title: string; position: string; marketplace: string; url: string; ok: boolean; status: number }[];
  }>(null);

  // Scroll to highlighted product when fix flow is active
  useEffect(() => {
    if (!fixProductId || products.isLoading) return;
    const el = document.getElementById(`product-${fixProductId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [fixProductId, products.isLoading]);

  const confirmFix = useMutation({
    mutationFn: (pid: number) => markProductFixed(pid),
    onSuccess: (_, pid) => {
      setJustFixedId(pid);
      qc.invalidateQueries({ queryKey: ['video-products', videoId] });
      qc.invalidateQueries({ queryKey: ['broken-links'] });
      setTimeout(() => navigate('/admin/broken-links'), 1500);
    },
  });

  const addProduct = useMutation({
    mutationFn: () => createVideoProduct(videoId, { ...form, position: '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['video-products', videoId] }); setShowAdd(false); },
    onError: (e: any) => setAddError(e.response?.data?.message || 'Erro ao adicionar link'),
  });

  const removeProduct = useMutation({
    mutationFn: (pid: number) => deleteProduct(pid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['video-products', videoId] }),
  });

  const replaceLink = useMutation({
    mutationFn: ({ pid, url }: { pid: number; url: string }) => replaceProductLink(pid, url),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['video-products', videoId] }); setReplacingId(null); setNewUrl(''); },
    onError: (e: any) => setReplaceError(e.response?.data?.message || 'URL inválida'),
  });

  const checkLinks = useMutation({
    mutationFn: () => checkVideoLinks(videoId),
    onSuccess: (data) => setCheckResult(data),
  });

  function openAdd(marketplace: MarketplaceKey) {
    setAddMkt(marketplace);
    setForm(EMPTY(marketplace));
    setAddError('');
    setShowAdd(true);
  }
  function field(key: keyof ProductPayload, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function fullShortUrl(p: any): string {
    const base = p.domain_hostname
      ? `https://${p.domain_hostname}`
      : (config.data?.publicBaseUrl ?? 'http://localhost:4000');
    return `${base}/r/${p.short_path}`;
  }

  const productList = products.data ?? [];

  function productsFor(marketplace: string) {
    return productList.filter((p: any) => (p.marketplace ?? '').toLowerCase() === marketplace);
  }

  // Legacy products (top1-5 from before the marketplace grouping)
  const legacyProducts = productList.filter((p: any) =>
    ['top1','top2','top3','top4','top5'].includes(p.position ?? '')
  );

  function statusBadge(result: { ok: boolean; status: number }) {
    return result.ok
      ? <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ OK ({result.status})</span>
      : <span className="text-xs font-medium text-red-500 dark:text-red-400">✗ Quebrado ({result.status || 'timeout'})</span>;
  }

  return (
    <div className={s.page}>
      <Link to="/admin/campaigns" className={`text-sm ${s.textMuted} hover:text-gray-800 dark:hover:text-gray-200 mb-4 inline-block`}>
        ← Campanhas
      </Link>

      {video.isLoading && <p className={`${s.textMuted} text-sm`}>Carregando...</p>}

      {video.data && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className={s.h1}>{video.data.title}</h1>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {video.data.platform && <span className={s.codeTag}>{video.data.platform}</span>}
                {video.data.original_video_url && (
                  <a href={video.data.original_video_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Ver vídeo ↗</a>
                )}
                <span className={`text-xs ${s.textMuted}`}>{video.data.total_clicks ?? 0} cliques totais</span>
              </div>
            </div>
            <button
              onClick={() => { setCheckResult(null); checkLinks.mutate(); }}
              disabled={checkLinks.isPending}
              className={`${s.btnSecondary} shrink-0`}
            >
              {checkLinks.isPending ? 'Verificando...' : '🔍 Verificar links'}
            </button>
          </div>

          {/* Fix mode banner */}
          {fixProductId && !justFixedId && (
            <div className={`${s.alertWarn} mb-6 flex items-center justify-between`}>
              <span>
                🔗 <strong>Modo correção:</strong> encontre o produto abaixo, troque o link afiliado e depois clique em <strong>Confirmar correção</strong>.
              </span>
              <button onClick={() => navigate(`/admin/campaigns/${videoId}`, { replace: true })} className="ml-4 text-xs opacity-60 hover:opacity-100 shrink-0">✕</button>
            </div>
          )}
          {justFixedId && (
            <div className={`${s.alertSuccess} mb-6`}>
              ✅ Link marcado como corrigido! Redirecionando para links quebrados...
            </div>
          )}

          {/* Check result panel */}
          {checkResult && (
            <div className={`${checkResult.broken > 0 ? s.alertError : s.alertSuccess} mb-6`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">
                  {checkResult.broken === 0
                    ? `✅ Todos os ${checkResult.checked} links estão funcionando`
                    : `❌ ${checkResult.broken} link(s) quebrado(s) de ${checkResult.checked} verificados`}
                </span>
                <button onClick={() => setCheckResult(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
              </div>
              <div className="space-y-1 mt-2">
                {checkResult.results.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-xs">
                    {statusBadge(r)}
                    <span className={s.textSecondary}>{r.title}</span>
                    <span className={`${s.codeTag} opacity-70`}>{r.position}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Marketplace groups */}
          <div className="space-y-6">
            {MARKETPLACES.map((mkt) => {
              const items = productsFor(mkt.key);
              const canAdd = items.length < 5;
              return (
                <div key={mkt.key}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className={`font-semibold text-sm ${mkt.color}`}>
                      {mkt.label} <span className={`${s.textMuted} font-normal`}>({items.length}/5)</span>
                    </h2>
                    {canAdd && (
                      <button onClick={() => openAdd(mkt.key as MarketplaceKey)} className={s.btnPrimary}>
                        + Adicionar
                      </button>
                    )}
                  </div>

                  {items.length === 0 ? (
                    <div className={`${s.card} border-dashed p-6 text-center`}>
                      <p className={`${s.textMuted} text-sm`}>Nenhum link de {mkt.label} adicionado.</p>
                      <button onClick={() => openAdd(mkt.key as MarketplaceKey)}
                        className={`mt-2 text-sm ${mkt.color} hover:underline font-medium`}>
                        + Adicionar primeiro link
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((p: any) => {
                        const shortUrl = fullShortUrl(p);
                        const checkRes = checkResult?.results.find((r) => r.id === p.id);
                        const isFixTarget = fixProductId === p.id;
                        return (
                          <div
                            id={`product-${p.id}`}
                            key={p.id}
                            className={`${s.card} p-4 transition-all ${isFixTarget ? 'ring-2 ring-red-400 dark:ring-red-500' : ''}`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${mkt.bg} ${mkt.color} border ${mkt.border}`}>
                                    {p.position}
                                  </span>
                                  <span className={`text-xs font-medium ${s.textPrimary}`}>{p.title}</span>
                                  <span className={`text-xs ${s.textMuted}`}>{p.click_count ?? 0} cliques</span>
                                  {checkRes && statusBadge(checkRes)}
                                </div>
                                <div className="mt-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs ${s.textMuted} w-20 shrink-0`}>Link curto:</span>
                                    <code className={`${s.codeTagBrand} truncate max-w-xs`}>{shortUrl}</code>
                                    <CopyButton text={shortUrl} />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs ${s.textMuted} w-20 shrink-0`}>Afiliado:</span>
                                    <a href={p.affiliate_url} target="_blank" rel="noopener noreferrer"
                                      className={`text-xs ${s.textSecondary} hover:text-brand-600 dark:hover:text-brand-400 truncate max-w-xs`}>
                                      {p.affiliate_url}
                                    </a>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => { setReplacingId(p.id); setNewUrl(p.affiliate_url); setReplaceError(''); }}
                                  className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium px-2 py-1 border border-amber-200 dark:border-amber-700 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                                >
                                  Trocar link
                                </button>
                                <button
                                  onClick={() => { if (confirm('Remover este link?')) removeProduct.mutate(p.id); }}
                                  className={s.btnDanger}
                                >
                                  Remover
                                </button>
                              </div>
                            </div>

                            {replacingId === p.id && (
                              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                                <p className={`text-xs ${s.textSecondary} mb-2`}>
                                  Novo link afiliado. O link curto permanece o mesmo.
                                </p>
                                {replaceError && <p className="text-xs text-red-500 dark:text-red-400 mb-2">{replaceError}</p>}
                                <div className="flex gap-2">
                                  <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                                    className={s.inputMono} placeholder="https://..." />
                                  <button
                                    onClick={() => replaceLink.mutate({ pid: p.id, url: newUrl })}
                                    disabled={replaceLink.isPending || !newUrl}
                                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                                  >Salvar</button>
                                  <button onClick={() => setReplacingId(null)} className={s.btnSecondary}>Cancelar</button>
                                </div>
                              </div>
                            )}
                            {isFixTarget && !justFixedId && (
                              <div className="mt-3 pt-3 border-t border-red-100 dark:border-red-800/40">
                                <p className={`text-xs text-red-600 dark:text-red-400 mb-2`}>
                                  Este é o link quebrado. Troque o link acima se necessário, depois confirme a correção.
                                </p>
                                <button
                                  onClick={() => confirmFix.mutate(p.id)}
                                  disabled={confirmFix.isPending}
                                  className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                                >
                                  {confirmFix.isPending ? 'Salvando...' : '✅ Confirmar correção'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Legacy links (top1-5) */}
            {legacyProducts.length > 0 && (
              <div>
                <h2 className={`font-semibold text-sm ${s.textMuted} mb-3`}>
                  Links antigos (posição genérica)
                </h2>
                <div className="space-y-2">
                  {legacyProducts.map((p: any) => {
                    const shortUrl = fullShortUrl(p);
                    return (
                      <div key={p.id} className={`${s.card} p-4`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={s.codeTagBrand}>{p.position}</span>
                              <span className={`text-sm font-medium ${s.textPrimary}`}>{p.title}</span>
                              <span className={`text-xs ${s.textMuted}`}>{p.click_count ?? 0} cliques</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs ${s.textMuted} w-20 shrink-0`}>Link curto:</span>
                              <code className={`${s.codeTagBrand} truncate max-w-xs`}>{shortUrl}</code>
                              <CopyButton text={shortUrl} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => { setReplacingId(p.id); setNewUrl(p.affiliate_url); setReplaceError(''); }}
                              className="text-xs text-amber-600 dark:text-amber-400 px-2 py-1 border border-amber-200 dark:border-amber-700 rounded hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            >Trocar link</button>
                            <button onClick={() => { if (confirm('Remover?')) removeProduct.mutate(p.id); }} className={s.btnDanger}>
                              Remover
                            </button>
                          </div>
                        </div>
                        {replacingId === p.id && (
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            {replaceError && <p className="text-xs text-red-500 mb-2">{replaceError}</p>}
                            <div className="flex gap-2">
                              <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className={s.inputMono} placeholder="https://..." />
                              <button onClick={() => replaceLink.mutate({ pid: p.id, url: newUrl })}
                                disabled={replaceLink.isPending || !newUrl}
                                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Salvar</button>
                              <button onClick={() => setReplacingId(null)} className={s.btnSecondary}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Add product modal */}
          {showAdd && (
            <div className={s.overlay}>
              <div className={s.modal}>
                <div className={s.modalHeader}>
                  <h2 className={s.modalTitle}>Adicionar link afiliado</h2>
                </div>
                <div className={s.modalBody}>
                  {addError && <div className={s.alertError}>{addError}</div>}
                  <div>
                    <label className={s.label}>Marketplace</label>
                    <select
                      value={form.marketplace}
                      onChange={(e) => { setAddMkt(e.target.value as MarketplaceKey); field('marketplace', e.target.value); }}
                      className={s.select}
                    >
                      {MARKETPLACES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                    {(() => {
                      const count = productsFor(form.marketplace ?? 'mercadolivre').length;
                      return count >= 5
                        ? <p className="text-xs text-red-500 mt-1">Limite de 5 links atingido para este marketplace.</p>
                        : <p className={`${s.hint}`}>{5 - count} slot(s) disponível(is)</p>;
                    })()}
                  </div>
                  <div>
                    <label className={s.label}>Nome do produto</label>
                    <input value={form.title} onChange={(e) => field('title', e.target.value)}
                      className={s.input} placeholder="Ex: Câmera Sony A7" />
                  </div>
                  <div>
                    <label className={s.label}>Link afiliado</label>
                    <input value={form.affiliate_url} onChange={(e) => field('affiliate_url', e.target.value)}
                      className={s.inputMono} placeholder="https://..." />
                  </div>
                  <div>
                    <label className={s.label}>Domínio (opcional)</label>
                    <select value={form.domain_id ?? ''} onChange={(e) => field('domain_id', e.target.value ? Number(e.target.value) : null)} className={s.select}>
                      <option value="">Padrão</option>
                      {(domains.data ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
                    </select>
                  </div>
                </div>
                <div className={s.modalFooter}>
                  <button onClick={() => setShowAdd(false)} className={s.btnSecondary}>Cancelar</button>
                  <button
                    onClick={() => addProduct.mutate()}
                    disabled={addProduct.isPending || !form.title || !form.affiliate_url || productsFor(form.marketplace ?? '').length >= 5}
                    className={s.btnPrimary}
                  >
                    {addProduct.isPending ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
