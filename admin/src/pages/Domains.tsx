import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listDomains, createDomain, deleteDomain } from '../lib/api';
import { s } from '../lib/styles';

export default function Domains() {
  const qc = useQueryClient();
  const domains = useQuery({ queryKey: ['domains'], queryFn: listDomains });

  const [showCreate, setShowCreate] = useState(false);
  const [hostname, setHostname] = useState('');
  const [name, setName] = useState('');
  const [createError, setCreateError] = useState('');

  const create = useMutation({
    mutationFn: () => createDomain(name || hostname, hostname),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); setShowCreate(false); setHostname(''); setName(''); },
    onError: (e: any) => setCreateError(e.response?.data?.message || 'Erro ao cadastrar domínio'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteDomain(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
    onError: (e: any) => alert(e.response?.data?.message || 'Erro ao excluir domínio'),
  });

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Domínios</h1>
          <p className={s.sub}>Domínios usados para links curtos</p>
        </div>
        <button onClick={() => { setShowCreate(true); setCreateError(''); setHostname(''); setName(''); }} className={s.btnPrimary}>
          + Novo domínio
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className="w-full text-sm">
          <thead className={s.thead}>
            <tr>
              {['Nome', 'Hostname', 'Status', 'Criado em', ''].map((h) => (
                <th key={h} className={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {(domains.data ?? []).map((d: any) => (
              <tr key={d.id} className={s.tr}>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{d.name}</td>
                <td className="px-6 py-4"><code className={s.codeTag}>{d.hostname}</code></td>
                <td className="px-6 py-4">
                  {d.enabled
                    ? <span className="text-xs text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">Ativo</span>
                    : <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Inativo</span>}
                </td>
                <td className={`px-6 py-4 ${s.textXs}`}>{new Date(d.created_at).toLocaleDateString('pt-BR')}</td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => { if (confirm(`Excluir "${d.hostname}"?`)) remove.mutate(d.id); }} className={s.btnDanger}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {!domains.isLoading && domains.data?.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-6 py-10 text-center ${s.textMuted} text-sm`}>
                  Nenhum domínio cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Novo domínio</h2>
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
              <div className={s.modalFooter.replace('px-6 py-4 border-t border-gray-100 dark:border-gray-700 ', '')}>
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
