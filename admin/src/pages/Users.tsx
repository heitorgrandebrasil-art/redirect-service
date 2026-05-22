import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { listUsers, createUser, updateUser, deleteUser, resetUser2FA } from '../lib/api';
import { s } from '../lib/styles';

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: listUsers });

  // ── Create ────────────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName]       = useState('');
  const [cEmail, setCEmail]     = useState('');
  const [cPw, setCPw]           = useState('');
  const [cConfirm, setCConfirm] = useState('');
  const [cRole, setCRole]       = useState('operator');
  const [cError, setCError]     = useState('');

  function resetCreate() {
    setCName(''); setCEmail(''); setCPw(''); setCConfirm(''); setCRole('operator'); setCError('');
  }

  const create = useMutation({
    mutationFn: () => createUser({ name: cName.trim(), email: cEmail, password: cPw, role: cRole }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); resetCreate(); },
    onError: (e: any) => setCError(e.response?.data?.message || '❌ Não foi possível criar o usuário. Tente de novo.'),
  });

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    setCError('');
    if (cName.trim().length < 2) { setCError('O nome deve ter pelo menos 2 caracteres.'); return; }
    if (cPw !== cConfirm) { setCError('As senhas não coincidem.'); return; }
    create.mutate();
  }

  // ── Edit ──────────────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<any>(null);
  const [eName, setEName]       = useState('');
  const [eEmail, setEEmail]     = useState('');
  const [ePw, setEPw]           = useState('');
  const [eConfirm, setEConfirm] = useState('');
  const [eRole, setERole]       = useState('operator');
  const [eError, setEError]     = useState('');

  function openEdit(u: any) {
    setEditTarget(u);
    setEName(u.name ?? ''); setEEmail(u.email); setEPw(''); setEConfirm(''); setERole(u.role); setEError('');
  }
  function closeEdit() { setEditTarget(null); }

  const edit = useMutation({
    mutationFn: () => {
      const payload: any = { name: eName.trim() || undefined, email: eEmail, role: eRole };
      if (ePw) payload.password = ePw;
      return updateUser(editTarget.id, payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); closeEdit(); },
    onError: (e: any) => setEError(e.response?.data?.message || '❌ Não foi possível salvar. Tente de novo.'),
  });

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    setEError('');
    if (eName.trim().length > 0 && eName.trim().length < 2) { setEError('O nome deve ter pelo menos 2 caracteres.'); return; }
    if (ePw && ePw !== eConfirm) { setEError('As senhas não coincidem.'); return; }
    if (ePw && ePw.length < 8) { setEError('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    edit.mutate();
  }

  // ── Reset 2FA ─────────────────────────────────────────────────────────────────
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [resetError, setResetError]   = useState('');

  const reset2fa = useMutation({
    mutationFn: (id: number) => resetUser2FA(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setResetTarget(null);
      setResetError('');
    },
    onError: (e: any) => setResetError(e.response?.data?.message || '❌ Não foi possível resetar o 2FA. Tente de novo.'),
  });

  // ── Delete ────────────────────────────────────────────────────────────────────
  const remove = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Usuários</h1>
          <p className={s.sub}>Gerenciar acesso ao painel</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); resetCreate(); }}
          className={s.btnPrimary}
        >
          + Novo usuário
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className="w-full text-sm">
          <thead className={s.thead}>
            <tr>
              {['Nome', 'E-mail', 'Função', '2FA', 'Criado em', ''].map((h) => (
                <th key={h} className={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {(users.data ?? []).map((u: any) => (
              <tr key={u.id} className={s.tr}>
                <td className={`px-6 py-4 font-medium ${s.textPrimary}`}>
                  {u.name ?? <span className={s.textMuted}>—</span>}
                  {u.id === me?.id && (
                    <span className="ml-2 text-xs text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded">você</span>
                  )}
                </td>
                <td className={`px-6 py-4 ${s.textSecondary}`}>{u.email}</td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.role === 'admin'
                      ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {u.role === 'admin' ? 'Administrador' : 'Operador'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {u.totp_enabled
                    ? <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Ativo</span>
                    : <span className={`text-xs ${s.textMuted}`}>—</span>}
                </td>
                <td className={`px-6 py-4 ${s.textXs}`}>
                  {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs px-2.5 py-1 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors"
                    >
                      Editar
                    </button>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => { if (confirm('Excluir usuário?')) remove.mutate(u.id); }}
                        className={s.btnDanger}
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.data?.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-6 py-10 text-center ${s.textMuted} text-sm`}>
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Modal Novo usuário ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Novo usuário</h2>
            </div>
            <form onSubmit={submitCreate} className={s.modalBody}>
              {cError && <div className={s.alertError}>{cError}</div>}
              <div>
                <label className={s.label}>Nome</label>
                <input
                  type="text"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  required
                  autoFocus
                  className={s.input}
                  placeholder="Ex: Heitor Silva"
                />
              </div>
              <div>
                <label className={s.label}>E-mail</label>
                <input
                  type="email"
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  required
                  className={s.input}
                />
              </div>
              <div>
                <label className={s.label}>Senha (mín. 8 caracteres)</label>
                <input
                  type="password"
                  value={cPw}
                  onChange={(e) => setCPw(e.target.value)}
                  required
                  minLength={8}
                  className={s.input}
                />
              </div>
              <div>
                <label className={s.label}>Confirmar senha</label>
                <input
                  type="password"
                  value={cConfirm}
                  onChange={(e) => setCConfirm(e.target.value)}
                  required
                  className={`${s.input} ${cConfirm && cConfirm !== cPw ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                />
                {cConfirm && cConfirm !== cPw && (
                  <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
                )}
              </div>
              <div>
                <label className={s.label}>Função</label>
                <select value={cRole} onChange={(e) => setCRole(e.target.value)} className={s.select}>
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowCreate(false); resetCreate(); }} className={s.btnSecondary}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || (!!cConfirm && cConfirm !== cPw)}
                  className={s.btnPrimary}
                >
                  {create.isPending ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Editar usuário ───────────────────────────────────────────────── */}
      {editTarget && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Editar usuário</h2>
            </div>
            <form onSubmit={submitEdit} className={s.modalBody}>
              {eError && <div className={s.alertError}>{eError}</div>}
              <div>
                <label className={s.label}>Nome</label>
                <input
                  type="text"
                  value={eName}
                  onChange={(e) => setEName(e.target.value)}
                  autoFocus
                  className={s.input}
                  placeholder="Ex: Heitor Silva"
                />
              </div>
              <div>
                <label className={s.label}>E-mail</label>
                <input
                  type="email"
                  value={eEmail}
                  onChange={(e) => setEEmail(e.target.value)}
                  required
                  className={s.input}
                />
              </div>
              <div>
                <label className={s.label}>Nova senha <span className={`font-normal ${s.textMuted}`}>(deixe vazio para não alterar)</span></label>
                <input
                  type="password"
                  value={ePw}
                  onChange={(e) => setEPw(e.target.value)}
                  className={s.input}
                  placeholder="••••••••"
                />
              </div>
              {ePw && (
                <div>
                  <label className={s.label}>Confirmar nova senha</label>
                  <input
                    type="password"
                    value={eConfirm}
                    onChange={(e) => setEConfirm(e.target.value)}
                    className={`${s.input} ${eConfirm && eConfirm !== ePw ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    placeholder="••••••••"
                  />
                  {eConfirm && eConfirm !== ePw && (
                    <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
                  )}
                </div>
              )}
              <div>
                <label className={s.label}>Função</label>
                <select value={eRole} onChange={(e) => setERole(e.target.value)} className={s.select}>
                  <option value="operator">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {/* 2FA status + reset */}
              <div className="pt-2 border-t border-gray-100 dark:border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${s.textPrimary}`}>Autenticação de dois fatores</p>
                    <p className={`text-xs mt-0.5 ${editTarget?.totp_enabled ? 'text-green-600 dark:text-green-400' : s.textMuted}`}>
                      {editTarget?.totp_enabled ? '✓ 2FA ativo' : '— Não configurado'}
                    </p>
                  </div>
                  {editTarget?.totp_enabled && (
                    <button
                      type="button"
                      onClick={() => { setResetTarget(editTarget); setResetError(''); closeEdit(); }}
                      className={s.btnDanger}
                    >
                      Resetar 2FA
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeEdit} className={s.btnSecondary}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={edit.isPending || (!!eConfirm && eConfirm !== ePw)}
                  className={s.btnPrimary}
                >
                  {edit.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Modal: Confirmar reset 2FA ─────────────────────────────────────────── */}
      {resetTarget && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Resetar 2FA de {resetTarget.name || resetTarget.email}?</h2>
            </div>
            <div className={s.modalBody}>
              <p className={`text-sm ${s.textSecondary}`}>
                O 2FA será removido desta conta. O usuário poderá entrar apenas com e-mail e senha e precisará
                configurar o 2FA novamente em <strong>Minha Conta</strong>.
              </p>
              {resetError && <div className={s.alertError}>{resetError}</div>}
            </div>
            <div className={s.modalFooter}>
              <button
                onClick={() => { setResetTarget(null); setResetError(''); }}
                className={s.btnSecondary}
                disabled={reset2fa.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => reset2fa.mutate(resetTarget.id)}
                disabled={reset2fa.isPending}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {reset2fa.isPending ? 'Resetando...' : 'Confirmar reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
