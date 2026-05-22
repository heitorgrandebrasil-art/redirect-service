import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { setupTotp, enableTotp, disableTotp, regenerateBackupCodes, changePassword } from '../lib/api';
import { s } from '../lib/styles';

export default function MyAccount() {
  const { user, setAuth } = useAuth();
  const qc = useQueryClient();

  // ── Alterar senha ─────────────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError]     = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePw = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: () => {
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
    },
    onError: (e: any) => setPwError(e.response?.data?.message || '❌ Não foi possível alterar a senha. Tente de novo.'),
  });

  // ── 2FA ───────────────────────────────────────────────────────────────────────
  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'codes'>('idle');
  const [totpData, setTotpData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpError, setTotpError] = useState('');

  const [copiedIndex, setCopiedIndex]       = useState<number | null>(null);
  const [codesCopied, setCodesCopied]       = useState(false);
  const [codesDownloaded, setCodesDownloaded] = useState(false);
  const [copyAllMsg, setCopyAllMsg]         = useState(false);

  const [disableModal, setDisableModal] = useState(false);
  const [disablePw, setDisablePw]       = useState('');
  const [disableError, setDisableError] = useState('');

  useEffect(() => {
    if (totpStep === 'codes') {
      setCopiedIndex(null); setCodesCopied(false); setCodesDownloaded(false); setCopyAllMsg(false);
    }
  }, [totpStep]);

  const setup = useMutation({
    mutationFn: setupTotp,
    onSuccess: (data) => { setTotpData(data); setTotpStep('setup'); setTotpError(''); },
  });

  const enable = useMutation({
    mutationFn: () => enableTotp(totpCode),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setTotpStep('codes');
      qc.invalidateQueries({ queryKey: ['me'] });
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        u.totp_enabled = true;
        const token = localStorage.getItem('access_token') ?? '';
        setAuth(token, u);
      }
    },
    onError: (e: any) => setTotpError(e.response?.data?.message || 'Código inválido'),
  });

  const disable = useMutation({
    mutationFn: () => disableTotp(disablePw),
    onSuccess: () => {
      setDisableModal(false); setDisablePw(''); setDisableError('');
      qc.invalidateQueries({ queryKey: ['me'] });
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        u.totp_enabled = false;
        const token = localStorage.getItem('access_token') ?? '';
        setAuth(token, u);
      }
    },
    onError: (e: any) => setDisableError(e.response?.data?.message || 'Senha incorreta. Tente novamente.'),
  });

  const regenCodes = useMutation({
    mutationFn: regenerateBackupCodes,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setCopiedIndex(null); setCodesCopied(false); setCodesDownloaded(false); setCopyAllMsg(false);
    },
  });

  function copyCode(code: string, index: number) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function copyAllCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n')).catch(() => {});
    setCodesCopied(true); setCopyAllMsg(true);
    setTimeout(() => setCopyAllMsg(false), 3000);
  }

  function downloadCodes() {
    const now = new Date().toLocaleString('pt-BR');
    const text = [
      '=== Redirect Admin — Códigos de Backup 2FA ===',
      `Gerados em: ${now}`,
      'ATENÇÃO: Cada código só pode ser usado UMA vez.',
      'Guarde em local seguro e não compartilhe com ninguém.',
      '',
      ...backupCodes,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'redirect-admin-backup-codes.txt'; a.click();
    URL.revokeObjectURL(url);
    setCodesDownloaded(true);
  }

  return (
    <div className={`${s.page} max-w-2xl`}>
      <div className="mb-8">
        <h1 className={s.h1}>Minha Conta</h1>
        <p className={s.sub}>Gerencie sua senha e autenticação de dois fatores</p>
      </div>

      {/* ── Informações da conta (somente leitura) ── */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Informações da conta</h2>
        <div className="space-y-3">
          <div>
            <p className={s.label}>Nome</p>
            <p className={`text-sm ${s.textPrimary} py-2 px-3 bg-gray-50 dark:bg-gh-over rounded-lg border border-gray-200 dark:border-white/[0.08]`}>
              {user?.name || <span className={s.textMuted}>—</span>}
            </p>
          </div>
          <div>
            <p className={s.label}>E-mail</p>
            <p className={`text-sm font-mono ${s.textPrimary} py-2 px-3 bg-gray-50 dark:bg-gh-over rounded-lg border border-gray-200 dark:border-white/[0.08]`}>
              {user?.email}
            </p>
          </div>
          <div>
            <p className={s.label}>Função</p>
            <p className={`text-sm ${s.textPrimary} py-2 px-3 bg-gray-50 dark:bg-gh-over rounded-lg border border-gray-200 dark:border-white/[0.08]`}>
              {user?.role === 'admin' ? 'Administrador' : 'Operador'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Alterar senha ── */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Alterar senha</h2>
        {pwSuccess && <div className={`${s.alertSuccess} mb-4`}>✅ Pronto! A senha foi alterada.</div>}
        {pwError && <div className={`${s.alertError} mb-4`}>{pwError}</div>}
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setPwError(''); setPwSuccess(false);
            if (newPw !== confirmPw) { setPwError('As novas senhas não coincidem.'); return; }
            changePw.mutate();
          }}
          className="space-y-3"
        >
          <div>
            <label className={s.label}>Senha atual</label>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required className={s.input} />
          </div>
          <div>
            <label className={s.label}>Nova senha (mín. 8 caracteres)</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} className={s.input} />
          </div>
          <div>
            <label className={s.label}>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              className={`${s.input} ${confirmPw && confirmPw !== newPw ? 'border-red-500 focus:ring-red-500' : ''}`}
            />
            {confirmPw && confirmPw !== newPw && (
              <p className="text-xs text-red-400 mt-1">As senhas não coincidem</p>
            )}
          </div>
          <button
            type="submit"
            disabled={changePw.isPending || (!!confirmPw && confirmPw !== newPw)}
            className={s.btnPrimary}
          >
            {changePw.isPending ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </section>

      {/* ── Autenticação de dois fatores ── */}
      <section className={s.cardPad}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className={`font-semibold ${s.textPrimary}`}>Autenticação de dois fatores (2FA)</h2>
            <p className={`text-xs ${s.textMuted} mt-0.5`}>
              {user?.totp_enabled ? '✅ Ativo' : '⚠️ Não configurado'}
            </p>
          </div>
          {user?.totp_enabled && totpStep === 'idle' && (
            <button
              onClick={() => { setDisableModal(true); setDisablePw(''); setDisableError(''); }}
              className={s.btnDanger}
            >
              Desativar
            </button>
          )}
        </div>

        {totpStep === 'idle' && !user?.totp_enabled && (
          <button onClick={() => setup.mutate()} disabled={setup.isPending} className={s.btnPrimary}>
            {setup.isPending ? 'Gerando...' : 'Configurar 2FA'}
          </button>
        )}

        {totpStep === 'idle' && user?.totp_enabled && (
          <div className="space-y-2">
            <p className={`text-sm ${s.textSecondary}`}>
              2FA está ativo. Use o Authy ou Google Authenticator para fazer login.
            </p>
            <button
              onClick={() => regenCodes.mutate()}
              disabled={regenCodes.isPending}
              className="text-sm text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 font-medium underline"
            >
              {regenCodes.isPending ? 'Gerando...' : 'Gerar novos códigos de backup'}
            </button>
            {backupCodes.length > 0 && (
              <div className="mt-3 space-y-3">
                <div className={s.alertWarn}>
                  <p className="font-semibold text-sm mb-1">⚠️ Novos códigos gerados! Guarde-os agora.</p>
                  <p className="text-xs">Cada código só pode ser usado uma vez.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <code className={`flex-1 font-mono text-sm ${s.textPrimary}`}>{c}</code>
                      <button onClick={() => copyCode(c, i)} className="text-gray-400 hover:text-brand-500 transition-colors flex-shrink-0">
                        {copiedIndex === i ? '✅' : '📋'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={copyAllCodes} className={s.btnSecondary}>📋 Copiar todos</button>
                  <button onClick={downloadCodes} className={s.btnSecondary}>💾 Baixar .txt</button>
                </div>
                {copyAllMsg && <div className={s.alertSuccess}>✅ Códigos copiados! Cole em um local seguro.</div>}
              </div>
            )}
          </div>
        )}

        {totpStep === 'setup' && totpData && (
          <div className="space-y-4">
            <p className={`text-sm ${s.textSecondary}`}>
              Escaneie o QR code com Authy ou Google Authenticator:
            </p>
            <img src={totpData.qrCodeDataUrl} alt="QR Code 2FA" className="w-48 h-48 border border-gray-200 dark:border-gray-600 rounded-lg bg-white" />
            <p className={`text-xs ${s.textMuted}`}>
              Ou insira manualmente: <code className={s.codeTag}>{totpData.secret}</code>
            </p>
            {totpError && <div className={s.alertError}>{totpError}</div>}
            <div className="flex gap-3">
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="w-36 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                onClick={() => enable.mutate()}
                disabled={enable.isPending || totpCode.length < 6}
                className={s.btnPrimary}
              >
                {enable.isPending ? 'Verificando...' : 'Ativar 2FA'}
              </button>
            </div>
          </div>
        )}

        {totpStep === 'codes' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">
                ⚠️ Guarde esses códigos agora! Eles não serão mostrados novamente.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Use-os se perder acesso ao seu autenticador. Cada código só funciona uma vez.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <code className={`flex-1 font-mono text-sm ${s.textPrimary}`}>{c}</code>
                  <button onClick={() => copyCode(c, i)} className="text-gray-400 hover:text-brand-500 transition-colors flex-shrink-0">
                    {copiedIndex === i ? '✅' : '📋'}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyAllCodes} className={s.btnSecondary}>📋 Copiar todos os códigos</button>
              <button onClick={downloadCodes} className={s.btnSecondary}>💾 Baixar como .txt</button>
            </div>
            {copyAllMsg && <div className={s.alertSuccess}>✅ Códigos copiados! Cole em um local seguro.</div>}
            {!codesCopied && !codesDownloaded && (
              <p className={`text-xs ${s.textSecondary}`}>Confirme que salvou os códigos para continuar</p>
            )}
            <button onClick={() => setTotpStep('idle')} disabled={!codesCopied && !codesDownloaded} className={s.btnPrimary}>
              Concluir
            </button>
          </div>
        )}
      </section>

      {/* ── Modal: Desativar 2FA ── */}
      {disableModal && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Desativar autenticação de dois fatores?</h3>
            </div>
            <div className={s.modalBody}>
              <p className={`text-sm ${s.textSecondary}`}>
                Isso vai remover a proteção extra da sua conta. Você precisará apenas de email e senha para entrar.
              </p>
              {disableError && <div className={s.alertError}>{disableError}</div>}
              <div>
                <label className={s.label}>Digite sua senha atual para confirmar</label>
                <input
                  type="password"
                  value={disablePw}
                  onChange={(e) => { setDisablePw(e.target.value); setDisableError(''); }}
                  className={s.input}
                  placeholder="Sua senha atual"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && disablePw && disable.mutate()}
                />
              </div>
            </div>
            <div className={s.modalFooter}>
              <button
                onClick={() => { setDisableModal(false); setDisablePw(''); setDisableError(''); }}
                className={s.btnSecondary}
                disabled={disable.isPending}
              >
                Cancelar
              </button>
              <button
                onClick={() => disable.mutate()}
                disabled={disable.isPending || !disablePw.trim()}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {disable.isPending ? 'Desativando...' : 'Desativar 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
