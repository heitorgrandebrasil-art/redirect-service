import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { getSetupStatus, setupFirstAdmin } from '../lib/api';

export default function Setup() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Redireciona para login se setup já foi feito
  const { data: setupStatus, isLoading: checkingSetup } = useQuery({
    queryKey: ['setup-status'],
    queryFn: getSetupStatus,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (!checkingSetup && setupStatus && !setupStatus.needsSetup) {
      navigate('/admin/login', { replace: true });
    }
  }, [setupStatus, checkingSetup, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (name.trim().length < 2) {
      setError('O nome deve ter pelo menos 2 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const data = await setupFirstAdmin({ name: name.trim(), email, password });
      sessionStorage.setItem('post_setup_complete', '1');
      setAuth(data.accessToken, data.user);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (checkingSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-gray-500 text-sm">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 shadow-lg shadow-brand-500/30 mb-4">
            <span className="text-white font-bold text-xl select-none">R</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Redirect Admin</h1>
          <p className="text-gray-400 mt-1 text-sm">Configuração inicial</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-8 shadow-2xl space-y-4">
          {/* Intro */}
          <div className="text-center pb-1">
            <p className="text-gray-300 text-sm leading-relaxed">
              Bem-vindo! Configure seu acesso de administrador para começar.
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              autoComplete="name"
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
              placeholder="Seu nome completo"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 placeholder-gray-500"
              placeholder="••••••••"
            />
            <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Confirmar senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className={`w-full bg-gray-700 border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-1 placeholder-gray-500 ${
                confirm && confirm !== password
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-600 focus:border-brand-500 focus:ring-brand-500'
              }`}
              placeholder="••••••••"
            />
            {confirm && confirm !== password && (
              <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || (!!confirm && confirm !== password)}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors mt-2"
          >
            {loading ? 'Criando conta...' : 'Criar minha conta'}
          </button>

          <p className="text-center text-xs text-gray-500 pt-1 leading-relaxed">
            Após criar, recomendamos ativar a autenticação de dois fatores em Configurações.
          </p>
        </form>
      </div>
    </div>
  );
}
