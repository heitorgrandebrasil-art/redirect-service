import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { verifyTotp } from '../lib/api';

export default function Verify2FA() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [useBackup, setUseBackup] = useState(false);
  const { setAuth } = useAuth();
  const navigate = useNavigate();

  const tempToken = sessionStorage.getItem('temp_token');

  function toggleMode() {
    setCode('');
    setError('');
    setUseBackup((v) => !v);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tempToken) { navigate('/admin/login'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await verifyTotp(tempToken, code);
      sessionStorage.removeItem('temp_token');
      if (data.usedBackupCode) {
        sessionStorage.setItem(
          'post_login_notice',
          'Você usou um código de backup. Reconfigure seu autenticador em Configurações → 2FA.'
        );
      }
      setAuth(data.accessToken, data.user);
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  }

  if (!tempToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400">Sessão inválida.</p>
          <Link to="/admin/login" className="text-brand-500 hover:underline text-sm mt-2 block">
            Voltar ao login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="text-2xl font-bold text-white">Verificação 2FA</h1>
          <p className="text-gray-400 mt-2 text-sm">
            {useBackup
              ? 'Digite um dos seus códigos de backup'
              : 'Digite o código do seu autenticador'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-8 shadow-2xl space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {useBackup ? 'Código de backup' : 'Código de verificação'}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              maxLength={useBackup ? 10 : 6}
              inputMode={useBackup ? 'text' : 'numeric'}
              className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-3 text-center text-xl tracking-widest font-mono focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder={useBackup ? 'xxxxxxxxxx' : '000000'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
          >
            {loading ? 'Verificando...' : 'Verificar'}
          </button>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={toggleMode}
              className="block w-full text-center text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {useBackup
                ? '← Voltar para o autenticador'
                : 'Perdeu acesso ao autenticador? → Usar código de backup'}
            </button>

            <Link
              to="/admin/login"
              className="block text-center text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Voltar ao login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
