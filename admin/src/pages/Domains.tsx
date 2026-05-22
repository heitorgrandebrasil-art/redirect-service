import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDomains, createDomain, deleteDomain } from '../lib/api';
import { s } from '../lib/styles';

function IcChevron({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function Domains() {
  const qc = useQueryClient();
  const domains = useQuery({ queryKey: ['domains'], queryFn: listDomains });

  const [showCreate, setShowCreate] = useState(false);
  const [hostname, setHostname] = useState('');
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [showDns, setShowDns] = useState(false);

  const create = useMutation({
    mutationFn: () => createDomain(name || hostname, hostname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['domains'] });
      setShowCreate(false); setHostname(''); setName(''); setShowDns(false);
    },
    onError: (e: any) => setCreateError(e.response?.data?.message || '❌ Não foi possível cadastrar o domínio. Tente de novo.'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteDomain(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setRemoveError(''); },
    onError: (e: any) => setRemoveError(e.response?.data?.message || '❌ Não foi possível remover o domínio. Tente de novo.'),
  });

  const list = domains.data ?? [];
  const hasInactive = list.some((d: any) => !d.enabled);

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Domínios</h1>
          <p className={s.sub}>Domínios usados para links curtos</p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(''); setHostname(''); setName(''); setShowDns(false); }} className={s.btnPrimary}>
          + Novo domínio
        </button>
      </div>

      {removeError && (
        <div className={`${s.alertError} mb-4 flex items-center justify-between`}>
          <span>{removeError}</span>
          <button onClick={() => setRemoveError('')} className="ml-4 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Domain cards */}
      <div className="space-y-3">
        {domains.isLoading && <p className={`${s.textMuted} text-sm`}>Carregando...</p>}

        {!domains.isLoading && list.length === 0 && (
          <div className={`${s.cardPad} text-center`}>
            <p className={`${s.textMuted} text-sm`}>Nenhum domínio cadastrado ainda.</p>
          </div>
        )}

        {list.map((d: any) => (
          <div key={d.id}
            className="bg-white dark:bg-gh-card border border-gray-200 dark:border-white/[0.08] rounded-xl px-5 py-4 flex items-center gap-4 hover:border-gray-300 dark:hover:border-white/[0.14] transition-colors">
            {/* Status dot */}
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${d.enabled ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gh-muted'}`} />

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-gh-text text-sm truncate">{d.name}</p>
              <code className="text-xs text-gray-500 dark:text-gh-muted font-mono">{d.hostname}</code>
            </div>

            {/* Status badge */}
            <span className={`flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
              d.enabled
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-gray-500/10 text-gray-400 dark:text-gh-muted border border-gray-300 dark:border-white/[0.1]'
            }`}>
              {d.enabled ? 'Ativo' : 'Inativo'}
            </span>

            {/* Date */}
            <span className="hidden sm:block flex-shrink-0 text-xs text-gray-400 dark:text-gh-muted">
              {new Date(d.created_at).toLocaleDateString('pt-BR')}
            </span>

            {/* Delete */}
            <button
              onClick={() => { if (confirm(`Excluir "${d.hostname}"?`)) remove.mutate(d.id); }}
              className="flex-shrink-0 text-xs text-red-500 hover:text-red-400 font-medium transition-colors px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              Excluir
            </button>
          </div>
        ))}
      </div>

      {/* Warning for inactive domains */}
      {hasInactive && (
        <div className="mt-4 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 text-orange-700 dark:text-orange-400 text-sm rounded-xl px-5 py-4 flex items-start gap-3">
          <span className="text-lg leading-none flex-shrink-0">⚠</span>
          <div>
            <p className="font-medium">Domínios inativos detectados</p>
            <p className="text-xs mt-0.5 opacity-80">Links encurtados com domínios inativos podem não funcionar corretamente.</p>
          </div>
        </div>
      )}

      {/* Modal */}
      {showCreate && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Adicionar domínio</h2>
            </div>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); setCreateError(''); create.mutate(); }} className={s.modalBody}>
              {createError && <div className={s.alertError}>{createError}</div>}

              <div>
                <label className={s.label}>Endereço do domínio</label>
                <input value={hostname} onChange={(e) => setHostname(e.target.value)} required
                  placeholder="links.seusite.com.br" className={s.inputMono} />
                <p className={s.hint}>Sem http:// — apenas o domínio</p>
              </div>

              <div>
                <label className={s.label}>Nome de exibição (opcional)</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={hostname || 'Ex: Canal Principal'} className={s.input} />
                <p className={s.hint}>Se vazio, usa o próprio endereço como nome</p>
              </div>

              {/* DNS section — collapsible */}
              <div className="border border-gray-200 dark:border-white/[0.08] rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDns((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gh-text hover:bg-gray-50 dark:hover:bg-gh-over/50 transition-colors"
                >
                  <span>Configuração de DNS</span>
                  <IcChevron open={showDns} />
                </button>
                {showDns && (
                  <div className="px-4 pb-4 pt-1 space-y-2 border-t border-gray-100 dark:border-white/[0.06]">
                    <p className={`${s.textSecondary} text-xs`}>
                      Adicione um registro <strong>CNAME</strong> ou <strong>A</strong> no painel do seu provedor de DNS apontando para o servidor deste painel.
                    </p>
                    <div className="bg-gray-50 dark:bg-gh-over rounded-lg p-3 font-mono text-xs text-gray-700 dark:text-gh-text space-y-1">
                      <p>Tipo: <span className="text-brand-500">CNAME</span></p>
                      <p>Nome: <span className="text-brand-500">{hostname || 'links'}</span></p>
                      <p>Destino: <span className="text-brand-500">seu-servidor.com</span></p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className={s.btnSecondary}>Cancelar</button>
                <button type="submit" disabled={create.isPending || !hostname} className={s.btnPrimary}>
                  {create.isPending ? 'Cadastrando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
