import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { listUsers, createUser, deleteUser, updateUserRole } from '../lib/api';
import { s } from '../lib/styles';

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['users'], queryFn: listUsers });

  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('operator');
  const [createError, setCreateError] = useState('');

  const create = useMutation({
    mutationFn: () => createUser({ email, password, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowCreate(false);
      setEmail(''); setPassword(''); setRole('operator');
    },
    onError: (e: any) => setCreateError(e.response?.data?.message || '❌ Não foi possível criar o usuário. Tente de novo.')
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  });

  const changeRole = useMutation({
    mutationFn: ({ id, newRole }: { id: number; newRole: string }) => updateUserRole(id, newRole),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  });

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Usuários</h1>
          <p className={s.sub}>Gerenciar acesso ao painel</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(''); }}
          className={s.btnPrimary}
        >
          + Novo usuário
        </button>
      </div>

      <div className={s.tableWrap}>
        <table className="w-full text-sm">
          <thead className={s.thead}>
            <tr>
              {['E-mail', 'Função', '2FA', 'Criado em', ''].map((h) => (
                <th key={h} className={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {(users.data ?? []).map((u: any) => (
              <tr key={u.id} className={s.tr}>
                <td className={`px-6 py-4 font-medium ${s.textPrimary}`}>
                  {u.email}
                  {u.id === me?.id && (
                    <span className="ml-2 text-xs text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded">você</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {u.id === me?.id ? (
                    <span className={`text-xs ${s.textMuted} capitalize`}>{u.role}</span>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => changeRole.mutate({ id: u.id, newRole: e.target.value })}
                      className="text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="operator">Operador</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
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
                  {u.id !== me?.id && (
                    <button
                      onClick={() => { if (confirm('Excluir usuário?')) remove.mutate(u.id); }}
                      className={s.btnDanger}
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.data?.length === 0 && (
              <tr>
                <td colSpan={5} className={`px-6 py-10 text-center ${s.textMuted} text-sm`}>
                  Nenhum usuário encontrado.
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
              <h2 className={s.modalTitle}>Novo usuário</h2>
            </div>
            <form
              onSubmit={(e: FormEvent) => { e.preventDefault(); setCreateError(''); create.mutate(); }}
              className={s.modalBody}
            >
              {createError && <div className={s.alertError}>{createError}</div>}
              <div>
                <label className={s.label}>E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className={s.input}
                />
              </div>
              <div>
                <label className={s.label}>Senha (mín. 8 caracteres)</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className={s.input}
                />
              </div>
              <div>
                <label className={s.label}>Função</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={s.select}
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className={s.modalFooter.replace('px-6 py-4 border-t border-gray-100 dark:border-gray-700 ', '')}>
                <button type="button" onClick={() => setShowCreate(false)} className={s.btnSecondary}>
                  Cancelar
                </button>
                <button type="submit" disabled={create.isPending} className={s.btnPrimary}>
                  {create.isPending ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
