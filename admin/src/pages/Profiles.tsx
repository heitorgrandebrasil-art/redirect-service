import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, listDomains, createDomain,
  testTelegramBot, type ProfilePayload
} from '../lib/api';
import { s } from '../lib/styles';

const PLATFORMS = [
  { value: 'youtube', label: 'YouTube', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
  { value: 'instagram', label: 'Instagram', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' },
  { value: 'tiktok', label: 'TikTok', color: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300' },
  { value: 'facebook', label: 'Facebook', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  { value: 'x', label: 'X (Twitter)', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  { value: 'other', label: 'Outro', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
];

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS.find((x) => x.value === platform);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p?.color ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
      {p?.label ?? platform}
    </span>
  );
}

interface FormState extends ProfilePayload {
  newDomainHostname: string;
  domainMode: 'existing' | 'new';
}
const EMPTY: FormState = {
  name: '', platform: 'youtube', domain_id: null,
  telegram_bot_token: '', telegram_chat_id: '',
  newDomainHostname: '', domainMode: 'existing',
};

export default function Profiles() {
  const qc = useQueryClient();
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const domains = useQuery({ queryKey: ['domains'], queryFn: listDomains });

  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [tgStatus, setTgStatus] = useState<{ id: number; ok: boolean; msg: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let domainId = form.domain_id;
      if (form.domainMode === 'new' && form.newDomainHostname.trim()) {
        const nd = await createDomain(form.newDomainHostname.trim(), form.newDomainHostname.trim());
        domainId = nd.id;
        qc.invalidateQueries({ queryKey: ['domains'] });
      }
      const payload: ProfilePayload = {
        name: form.name, platform: form.platform, domain_id: domainId,
        telegram_bot_token: form.telegram_bot_token || null,
        telegram_chat_id: form.telegram_chat_id || null,
      };
      return editing?.id ? updateProfile(editing.id, payload) : createProfile(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); closeModal(); },
    onError: (e: any) => setError(e.response?.data?.message || '❌ Não foi possível salvar o perfil. Tente de novo.'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });

  const testBot = useMutation({
    mutationFn: (id: number) => testTelegramBot(id),
    onSuccess: (_, id) => setTgStatus({ id, ok: true, msg: '✅ Mensagem enviada! Verifique seu Telegram.' }),
    onError: (e: any, id) => setTgStatus({ id, ok: false, msg: e.response?.data?.message || '❌ Não foi possível enviar. Verifique o token e tente de novo.' }),
  });

  function openCreate() { setEditing(null); setForm(EMPTY); setError(''); setShowModal(true); }
  function openEdit(p: any) {
    setEditing(p);
    setForm({
      name: p.name, platform: p.platform, domain_id: p.domain_id,
      telegram_bot_token: p.telegram_bot_token ?? '',
      telegram_chat_id: p.telegram_chat_id ?? '',
      newDomainHostname: '', domainMode: 'existing',
    });
    setError(''); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditing(null); }
  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Perfis</h1>
          <p className={s.sub}>Canais e seus domínios de links curtos</p>
        </div>
        <button onClick={openCreate} className={s.btnPrimary}>+ Novo perfil</button>
      </div>

      <div className={s.tableWrap}>
        <table className="w-full text-sm">
          <thead className={s.thead}>
            <tr>
              {['Nome', 'Plataforma', 'Domínio', 'Telegram', 'Campanhas', ''].map((h) => (
                <th key={h} className={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {(profiles.data ?? []).map((p: any) => (
              <tr key={p.id} className={s.tr}>
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{p.name}</td>
                <td className="px-6 py-4"><PlatformBadge platform={p.platform} /></td>
                <td className="px-6 py-4">
                  <code className={s.codeTag}>{p.domain_hostname ?? '—'}</code>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {p.telegram_chat_id ? (
                      <>
                        <span className="text-green-600 dark:text-green-400 text-xs font-medium">✓ Configurado</span>
                        <button
                          onClick={() => { setTgStatus(null); testBot.mutate(p.id); }}
                          disabled={testBot.isPending && testBot.variables === p.id}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                        >
                          {testBot.isPending && testBot.variables === p.id ? 'Testando...' : 'Testar'}
                        </button>
                      </>
                    ) : (
                      <span className={`${s.textMuted} text-xs`}>—</span>
                    )}
                  </div>
                  {tgStatus && tgStatus.id === p.id && (
                    <p className={`text-xs mt-1 ${tgStatus.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      {tgStatus.ok ? '✅' : '❌'} {tgStatus.msg}
                    </p>
                  )}
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{p.campaign_count}</td>
                <td className="px-6 py-4 text-right space-x-3">
                  <button onClick={() => openEdit(p)} className={s.btnLink}>Editar</button>
                  <button
                    onClick={() => { if (confirm('Excluir este perfil?')) remove.mutate(p.id); }}
                    className={s.btnDanger}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {profiles.data?.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-6 py-10 text-center ${s.textMuted} text-sm`}>
                  Nenhum perfil cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={s.overlay}>
          <div className={`${s.modal} max-h-[90vh] overflow-y-auto`}>
            <div className={`${s.modalHeader} sticky top-0`} style={{ background: 'inherit' }}>
              <h2 className={s.modalTitle}>{editing ? 'Editar perfil' : 'Novo perfil'}</h2>
            </div>
            <div className={s.modalBody}>
              {error && <div className={s.alertError}>{error}</div>}

              <div>
                <label className={s.label}>Nome do canal</label>
                <input value={form.name} onChange={(e) => field('name', e.target.value)} className={s.input} placeholder="Ex: Canal do João" />
              </div>

              <div>
                <label className={s.label}>Plataforma</label>
                <select value={form.platform} onChange={(e) => field('platform', e.target.value)} className={s.select}>
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {/* Domain toggle */}
              <div>
                <label className={`${s.label} mb-2`}>Domínio dos links curtos</label>
                <div className="flex gap-2 mb-3">
                  {(['existing', 'new'] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => field('domainMode', mode)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                        form.domainMode === mode
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'
                      }`}>
                      {mode === 'existing' ? 'Selecionar existente' : 'Cadastrar novo'}
                    </button>
                  ))}
                </div>
                {form.domainMode === 'existing' ? (
                  <select value={form.domain_id ?? ''} onChange={(e) => field('domain_id', e.target.value ? Number(e.target.value) : null)} className={s.select}>
                    <option value="">Nenhum</option>
                    {(domains.data ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.hostname}</option>)}
                  </select>
                ) : (
                  <div>
                    <input value={form.newDomainHostname} onChange={(e) => field('newDomainHostname', e.target.value)}
                      placeholder="links.meucanal.com.br" className={s.inputMono} />
                    <p className={s.hint}>Sem http:// — apenas o domínio. Será criado automaticamente.</p>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Telegram (opcional)</p>
                <div className="space-y-3">
                  <div>
                    <label className={s.label}>Token do bot</label>
                    <input value={form.telegram_bot_token ?? ''} onChange={(e) => field('telegram_bot_token', e.target.value)}
                      className={s.inputMono} placeholder="123456789:ABC..." />
                  </div>
                  <div>
                    <label className={s.label}>Chat ID</label>
                    <input value={form.telegram_chat_id ?? ''} onChange={(e) => field('telegram_chat_id', e.target.value)}
                      className={s.inputMono} placeholder="-100123456789" />
                  </div>
                </div>
              </div>
            </div>
            <div className={`${s.modalFooter} sticky bottom-0 bg-white dark:bg-gray-800`}>
              <button onClick={closeModal} className={s.btnSecondary}>Cancelar</button>
              <button onClick={() => save.mutate()} disabled={save.isPending} className={s.btnPrimary}>
                {save.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
