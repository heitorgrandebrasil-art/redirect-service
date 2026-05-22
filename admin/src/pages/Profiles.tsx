import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listProfiles, createProfile, updateProfile, deleteProfile, listDomains, createDomain,
  testTelegramBot, type ProfilePayload
} from '../lib/api';
import { s } from '../lib/styles';

const PLATFORMS = [
  { value: 'youtube',   label: 'YouTube',    color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  { value: 'instagram', label: 'Instagram',  color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  { value: 'tiktok',    label: 'TikTok',     color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
  { value: 'facebook',  label: 'Facebook',   color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'x',         label: 'X (Twitter)', color: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  { value: 'other',     label: 'Outro',      color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
];

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS.find((x) => x.value === platform);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${p?.color ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
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

// ── Profile Card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, onEdit, onDelete, onTest, testPending, testStatus }: {
  profile: any;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testPending: boolean;
  testStatus: { ok: boolean; msg: string } | null;
}) {
  const initial = profile.name?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="bg-white dark:bg-gh-card border border-gray-200 dark:border-white/[0.08] rounded-xl p-5 flex flex-col gap-4 hover:-translate-y-0.5 transition-transform duration-200 hover:border-gray-300 dark:hover:border-white/[0.14]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-brand-500/15 flex items-center justify-center text-brand-400 text-lg font-bold flex-shrink-0 select-none">
            {initial}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-gh-text text-sm">{profile.name}</p>
            <div className="mt-0.5">
              <PlatformBadge platform={profile.platform} />
            </div>
          </div>
        </div>
        <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Ativo
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-50 dark:bg-gh-over/50 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 dark:text-gh-muted mb-0.5">Campanhas</p>
          <p className="font-semibold text-gray-900 dark:text-gh-text">{profile.campaign_count ?? 0}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gh-over/50 rounded-lg px-3 py-2 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gh-muted mb-0.5">Domínio</p>
          <p className="font-mono text-xs text-gray-700 dark:text-gh-text truncate" title={profile.domain_hostname}>
            {profile.domain_hostname ?? '—'}
          </p>
        </div>
      </div>

      {/* Telegram */}
      {profile.telegram_chat_id ? (
        <div className="flex items-center justify-between border-t border-gray-100 dark:border-white/[0.06] pt-3 text-xs">
          <span className="flex items-center gap-1.5 text-gray-500 dark:text-gh-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Telegram configurado
          </span>
          <button
            onClick={onTest}
            disabled={testPending}
            className="text-brand-500 hover:text-brand-400 disabled:opacity-50 transition-colors text-xs font-medium"
          >
            {testPending ? 'Testando...' : 'Testar'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-white/[0.06] pt-3 text-xs text-gray-400 dark:text-gh-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gh-muted inline-block" />
          Telegram não configurado
        </div>
      )}

      {testStatus && (
        <p className={`text-xs ${testStatus.ok ? 'text-emerald-500' : 'text-red-400'}`}>{testStatus.msg}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button onClick={onEdit} className="flex-1 text-xs font-medium py-1.5 px-3 rounded-lg border border-gray-200 dark:border-white/[0.12] text-gray-600 dark:text-gh-muted hover:text-gray-900 dark:hover:text-gh-text hover:border-gray-300 dark:hover:border-white/[0.2] transition-colors">
          Editar
        </button>
        <button onClick={onDelete} className="text-xs font-medium py-1.5 px-3 rounded-lg border border-red-200 dark:border-red-500/20 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
          Excluir
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

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
    onError: (e: any, id) => setTgStatus({ id, ok: false, msg: e.response?.data?.message || '❌ Não foi possível enviar.' }),
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

  const list = profiles.data ?? [];

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Perfis</h1>
          <p className={s.sub}>Canais e seus domínios de links curtos</p>
        </div>
        <button onClick={openCreate} className={s.btnPrimary}>+ Novo perfil</button>
      </div>

      {profiles.isLoading && (
        <p className={`${s.textMuted} text-sm`}>Carregando...</p>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((p: any) => (
          <ProfileCard
            key={p.id}
            profile={p}
            onEdit={() => openEdit(p)}
            onDelete={() => { if (confirm('Excluir este perfil?')) remove.mutate(p.id); }}
            onTest={() => { setTgStatus(null); testBot.mutate(p.id); }}
            testPending={testBot.isPending && testBot.variables === p.id}
            testStatus={tgStatus?.id === p.id ? tgStatus : null}
          />
        ))}

        {/* Add new card */}
        <button
          onClick={openCreate}
          className="border-2 border-dashed border-gray-200 dark:border-white/[0.1] hover:border-brand-400 dark:hover:border-brand-500/50 rounded-xl p-5 flex flex-col items-center justify-center gap-2 min-h-[180px] text-gray-400 dark:text-gh-muted hover:text-brand-500 dark:hover:text-brand-400 transition-all duration-200 group"
        >
          <span className="text-3xl font-light leading-none group-hover:scale-110 transition-transform">+</span>
          <span className="text-sm font-medium">Adicionar novo perfil</span>
        </button>
      </div>

      {/* Modal */}
      {showModal && (
        <div className={s.overlay}>
          <div className={`${s.modal} max-h-[90vh] overflow-y-auto`}>
            <div className={`${s.modalHeader} sticky top-0 bg-white dark:bg-gh-card z-10`}>
              <h2 className={s.modalTitle}>{editing ? 'Editar perfil' : 'Adicionar perfil'}</h2>
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

              <div>
                <label className={`${s.label} mb-2`}>Domínio dos links curtos</label>
                <div className="flex gap-2 mb-3">
                  {(['existing', 'new'] as const).map((mode) => (
                    <button key={mode} type="button" onClick={() => field('domainMode', mode)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        form.domainMode === mode
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-white dark:bg-gh-over text-gray-600 dark:text-gh-muted border-gray-300 dark:border-white/[0.12] hover:border-gray-400 dark:hover:border-white/[0.2]'
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

              <div className="border-t border-gray-100 dark:border-white/[0.08] pt-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gh-muted uppercase tracking-wide mb-3">Telegram (opcional)</p>
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
            <div className={`${s.modalFooter} sticky bottom-0 bg-white dark:bg-gh-card z-10`}>
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
