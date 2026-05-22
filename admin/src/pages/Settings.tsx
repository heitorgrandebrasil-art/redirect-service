import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import {
  setupTotp, enableTotp, disableTotp, regenerateBackupCodes, changePassword,
  checkLinks, getSettings, updateLinkMonitor,
  saveGeminiKey, deleteGeminiKey, testCurrentGeminiKey, LinkCheckItem,
} from '../lib/api';
import { s } from '../lib/styles';

export default function Settings() {
  const { user, setAuth } = useAuth();
  const qc = useQueryClient();

  // — Alterar senha —
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePw = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: () => { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setPwError(''); },
    onError: (e: any) => setPwError(e.response?.data?.message || '❌ Não foi possível alterar a senha. Tente de novo.')
  });

  // — 2FA —
  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'codes'>('idle');
  const [totpData, setTotpData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpError, setTotpError] = useState('');

  // Estado da exibição dos códigos de backup
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);
  const [codesDownloaded, setCodesDownloaded] = useState(false);
  const [copyAllMsg, setCopyAllMsg] = useState(false);

  // Modal de desativar 2FA
  const [disableModal, setDisableModal] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [disableError, setDisableError] = useState('');

  // Resetar estados ao entrar na etapa de exibição dos códigos
  useEffect(() => {
    if (totpStep === 'codes') {
      setCopiedIndex(null);
      setCodesCopied(false);
      setCodesDownloaded(false);
      setCopyAllMsg(false);
    }
  }, [totpStep]);

  const setup = useMutation({
    mutationFn: setupTotp,
    onSuccess: (data) => { setTotpData(data); setTotpStep('setup'); setTotpError(''); }
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
    onError: (e: any) => setTotpError(e.response?.data?.message || 'Código inválido')
  });

  const disable = useMutation({
    mutationFn: () => disableTotp(disablePw),
    onSuccess: () => {
      setDisableModal(false);
      setDisablePw('');
      setDisableError('');
      qc.invalidateQueries({ queryKey: ['me'] });
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        u.totp_enabled = false;
        const token = localStorage.getItem('access_token') ?? '';
        setAuth(token, u);
      }
    },
    onError: (e: any) => setDisableError(e.response?.data?.message || 'Senha incorreta. Tente novamente.')
  });

  const regenCodes = useMutation({
    mutationFn: regenerateBackupCodes,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setCopiedIndex(null);
      setCodesCopied(false);
      setCodesDownloaded(false);
      setCopyAllMsg(false);
    }
  });

  // — Funções utilitárias para códigos de backup —
  function copyCode(code: string, index: number) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  function copyAllBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n')).catch(() => {});
    setCodesCopied(true);
    setCopyAllMsg(true);
    setTimeout(() => setCopyAllMsg(false), 3000);
  }

  function downloadBackupCodes() {
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
    a.href = url;
    a.download = 'redirect-admin-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setCodesDownloaded(true);
  }

  // — Verificação de links —
  const [linkCheckResult, setLinkCheckResult] = useState<{ checked: number; broken: number; brokenItems: any[]; allResults: LinkCheckItem[] } | null>(null);
  const linkCheck = useMutation({
    mutationFn: checkLinks,
    onSuccess: (data) => setLinkCheckResult(data),
  });

  // — Monitor de links —
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings, enabled: user?.role === 'admin' });
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorFreq, setMonitorFreq]       = useState(24);
  const [monitorSaved, setMonitorSaved]     = useState(false);
  const [monitorError, setMonitorError]     = useState('');

  useEffect(() => {
    if (!settingsQ.data) return;
    const m = settingsQ.data.monitor;
    setMonitorEnabled(m.enabled);
    setMonitorFreq(m.frequency_hours);
  }, [settingsQ.data]);

  const saveMonitor = useMutation({
    mutationFn: () => updateLinkMonitor({ enabled: monitorEnabled, frequency_hours: monitorFreq }),
    onSuccess: () => {
      setMonitorSaved(true);
      setMonitorError('');
      settingsQ.refetch();
      setTimeout(() => setMonitorSaved(false), 2500);
    },
    onError: (e: any) => setMonitorError(e.response?.data?.message || '❌ Não foi possível salvar. Tente de novo.'),
  });

  // — Gemini —
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<'idle' | { ok: boolean; message: string }>('idle');
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'testing' | { ok: boolean; message: string }>('idle');
  const [geminiDeleteConfirm, setGeminiDeleteConfirm] = useState(false);

  const saveGemini = useMutation({
    mutationFn: () => saveGeminiKey(geminiKey),
    onSuccess: () => {
      setGeminiKey('');
      setGeminiSaveStatus({ ok: true, message: '✅ Pronto! Chave do Gemini salva.' });
      setGeminiTestStatus('idle');
      settingsQ.refetch();
      setTimeout(() => setGeminiSaveStatus('idle'), 4000);
    },
    onError: () => setGeminiSaveStatus({ ok: false, message: '❌ Não foi possível salvar a chave. Tente de novo.' }),
  });

  const removeGemini = useMutation({
    mutationFn: deleteGeminiKey,
    onSuccess: () => {
      setGeminiDeleteConfirm(false);
      setGeminiSaveStatus('idle');
      setGeminiTestStatus('idle');
      settingsQ.refetch();
    },
  });

  const testCurrentKey = useMutation({
    mutationFn: testCurrentGeminiKey,
    onMutate: () => setGeminiTestStatus('testing'),
    onSuccess: (data) => {
      if (data.test.ok) {
        setGeminiTestStatus({ ok: true, message: 'Conexão bem-sucedida! Gemini está funcionando.' });
        settingsQ.refetch();
      } else {
        setGeminiTestStatus({ ok: false, message: geminiErrorMessage(data.test.error, data.test.code, data.test.isFreeTierExhausted) });
      }
    },
    onError: () => setGeminiTestStatus({ ok: false, message: '❌ Não foi possível testar a chave. Tente de novo.' }),
  });

  function geminiErrorMessage(error?: string, code?: number | null, isFreeTierExhausted?: boolean): string {
    if (code == null && (error?.includes('ECONNREFUSED') || error?.includes('ENOTFOUND') || error?.includes('ETIMEDOUT') || error?.toLowerCase().includes('failed to fetch'))) {
      return 'Não foi possível conectar à API do Gemini. Verifique sua conexão.';
    }
    if (code === 400 || code === 401 || code === 403 || error?.includes('API_KEY_INVALID') || error?.includes('API key not valid')) {
      return 'Chave inválida. Verifique se copiou corretamente em aistudio.google.com';
    }
    if (code === 429) {
      if (isFreeTierExhausted) {
        return 'Chave válida, mas cota gratuita diária esgotada (limit: 0). O Gemini vai funcionar normalmente amanhã quando a cota resetar. Para uso imediato, ative o faturamento no Google AI Studio.';
      }
      return 'Muitas requisições. Aguarde alguns minutos e tente novamente.';
    }
    if (code === 404 || error?.includes('is not found') || error?.includes('not_found')) {
      return 'Modelo indisponível para esta chave. Verifique se a API Gemini está ativa no projeto em aistudio.google.com';
    }
    return error
      ? `Erro ao conectar com a API do Gemini (código ${code ?? 'sem resposta'}): ${error}`
      : 'Erro desconhecido ao testar a chave.';
  }

  return (
    <div className={`${s.page} max-w-2xl`}>
      <div className="mb-8">
        <h1 className={s.h1}>Configurações</h1>
        <p className={s.sub}>{user?.email} · {user?.role}</p>
      </div>

      {/* Alterar senha */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Alterar senha</h2>
        {pwSuccess && <div className={`${s.alertSuccess} mb-4`}>✅ Pronto! A senha foi alterada.</div>}
        {pwError && <div className={`${s.alertError} mb-4`}>{pwError}</div>}
        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); setPwError(''); setPwSuccess(false); changePw.mutate(); }}
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
          <button type="submit" disabled={changePw.isPending} className={s.btnPrimary}>
            {changePw.isPending ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </section>

      {/* Monitor de links — admin only */}
      {user?.role === 'admin' && (
        <section className={`${s.cardPad} mb-6`}>
          <h2 className={`font-semibold ${s.textPrimary} mb-1`}>Monitor de links</h2>
          <p className={`text-sm ${s.textSecondary} mb-4`}>
            Verifica automaticamente se os links afiliados estão funcionando e envia alertas via Telegram.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className={s.label}>Monitoramento ativo</label>
              <button
                type="button"
                onClick={() => setMonitorEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${monitorEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${monitorEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div>
              <label className={s.label}>Frequência</label>
              <select value={monitorFreq} onChange={(e) => setMonitorFreq(Number(e.target.value))} className={s.select}>
                <option value={0.00833}>30 segundos (teste)</option>
                <option value={1}>A cada 1 hora</option>
                <option value={6}>A cada 6 horas</option>
                <option value={12}>A cada 12 horas</option>
                <option value={24}>A cada 24 horas</option>
                <option value={48}>A cada 48 horas</option>
              </select>
            </div>
            {settingsQ.data?.monitor.last_run && (
              <p className={`text-xs ${s.textMuted}`}>
                Última verificação: {new Date(settingsQ.data.monitor.last_run).toLocaleString('pt-BR')}
              </p>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <button onClick={() => saveMonitor.mutate()} disabled={saveMonitor.isPending} className={s.btnPrimary}>
                  {saveMonitor.isPending ? 'Salvando...' : 'Salvar configurações'}
                </button>
                {monitorSaved && <span className="text-xs text-green-600 dark:text-green-400">✅ Configurações salvas!</span>}
              </div>
              {monitorError && <div className={s.alertError}>{monitorError}</div>}
            </div>
          </div>
        </section>
      )}

      {/* Integrações de IA — admin only */}
      {user?.role === 'admin' && (
        <section className={`${s.cardPad} mb-6`}>
          <h2 className={`font-semibold ${s.textPrimary} mb-1`}>Integrações de IA</h2>
          <p className={`text-sm ${s.textSecondary} mb-4`}>
            Usada como fallback quando o sistema não consegue determinar automaticamente se um produto está disponível.
          </p>

          <div className="space-y-3">
            {settingsQ.data?.gemini_key_set ? (
              <>
                <div className="rounded-lg p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">
                    ✅ Chave salva. Use o botão "Testar conexão" para verificar se está funcionando.
                  </p>
                  <p className="text-xs font-mono text-green-700 dark:text-green-400 mt-1">
                    ●●●●●●●●{settingsQ.data.gemini_key_last4}
                  </p>
                  {settingsQ.data.gemini_key_updated_at && (
                    <p className={`text-xs ${s.textMuted} mt-0.5`}>
                      Último teste bem-sucedido:{' '}
                      {new Date(settingsQ.data.gemini_key_updated_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => testCurrentKey.mutate()}
                    disabled={testCurrentKey.isPending || geminiTestStatus === 'testing'}
                    className={s.btnSecondary}
                  >
                    {geminiTestStatus === 'testing' ? 'Testando...' : 'Testar conexão'}
                  </button>
                  {!geminiDeleteConfirm ? (
                    <button onClick={() => setGeminiDeleteConfirm(true)} className={s.btnDanger}>
                      Apagar chave
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${s.textSecondary}`}>Confirmar exclusão?</span>
                      <button
                        onClick={() => removeGemini.mutate()}
                        disabled={removeGemini.isPending}
                        className={`${s.btnDanger} text-xs py-1 px-2`}
                      >
                        Sim, apagar
                      </button>
                      <button onClick={() => setGeminiDeleteConfirm(false)} className={`${s.btnSecondary} text-xs py-1 px-2`}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                {geminiTestStatus !== 'idle' && geminiTestStatus !== 'testing' && (
                  <div className={geminiTestStatus.ok ? s.alertSuccess : s.alertError}>
                    {geminiTestStatus.ok ? '✅ ' : '❌ '}{geminiTestStatus.message}
                  </div>
                )}

                <div>
                  <label className={s.label}>Substituir chave (opcional)</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => { setGeminiKey(e.target.value); setGeminiSaveStatus('idle'); }}
                    placeholder="Deixe vazio para manter a chave atual"
                    className={s.inputMono}
                    autoComplete="off"
                  />
                </div>
                {geminiKey.trim() && (
                  <>
                    <button
                      onClick={() => saveGemini.mutate()}
                      disabled={saveGemini.isPending}
                      className={s.btnPrimary}
                    >
                      {saveGemini.isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                    {geminiSaveStatus !== 'idle' && (
                      <div className={geminiSaveStatus.ok ? s.alertSuccess : s.alertError}>
                        {geminiSaveStatus.ok ? '✅ ' : '❌ '}{geminiSaveStatus.message}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    ⚠️ Nenhuma chave cadastrada. Sistema usando apenas Playwright para verificação.
                  </p>
                </div>
                <div>
                  <label className={s.label}>Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => { setGeminiKey(e.target.value); setGeminiSaveStatus('idle'); }}
                    placeholder="Cole sua chave do Gemini aqui"
                    className={s.inputMono}
                    autoComplete="off"
                  />
                  <p className={s.hint}>
                    Obtenha em <span className="font-mono">aistudio.google.com</span>. Salva de forma criptografada.
                  </p>
                </div>
                <button
                  onClick={() => saveGemini.mutate()}
                  disabled={saveGemini.isPending || !geminiKey.trim()}
                  className={s.btnPrimary}
                >
                  {saveGemini.isPending ? 'Salvando...' : 'Salvar'}
                </button>
                {geminiSaveStatus !== 'idle' && (
                  <div className={geminiSaveStatus.ok ? s.alertSuccess : s.alertError}>
                    {geminiSaveStatus.ok ? '✅ ' : '❌ '}{geminiSaveStatus.message}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {/* Verificação de links — admin only */}
      {user?.role === 'admin' && (
        <section className={`${s.cardPad} mb-6`}>
          <h2 className={`font-semibold ${s.textPrimary} mb-1`}>Verificar links quebrados</h2>
          <p className={`text-sm ${s.textSecondary} mb-4`}>
            Testa todos os links afiliados e envia notificação Telegram para perfis com bot configurado.
          </p>
          <button
            onClick={() => { setLinkCheckResult(null); linkCheck.mutate(); }}
            disabled={linkCheck.isPending}
            className={s.btnPrimary}
          >
            {linkCheck.isPending ? 'Verificando...' : 'Verificar agora'}
          </button>
          {linkCheckResult && (
            <div className="mt-4 space-y-3">
              <div className={linkCheckResult.broken === 0 ? s.alertSuccess : s.alertError}>
                {linkCheckResult.broken === 0
                  ? `✅ Todos os ${linkCheckResult.checked} links estão funcionando.`
                  : `❌ ${linkCheckResult.broken} link(s) quebrado(s) de ${linkCheckResult.checked} verificados.`}
              </div>
              {linkCheckResult.allResults?.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {linkCheckResult.allResults.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-4 py-2.5 ${item.ok ? '' : 'bg-red-50 dark:bg-red-900/10'}`}
                      >
                        <span>{item.ok ? '✅' : (item as any).humanReview ? '🔍' : '❌'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.title}</p>
                          <p className={`text-xs ${s.textMuted} truncate`}>
                            {item.campaign}{item.campaign && ' · '}{item.marketplace}{item.position && ` · ${item.position}`}
                          </p>
                        </div>
                        <span className={`text-xs font-mono shrink-0 ${item.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {(item as any).humanReview ? 'revisão' : `HTTP ${item.status || 'erro'}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* 2FA */}
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
                <div className={`${s.alertWarn}`}>
                  <p className="font-semibold text-sm mb-1">⚠️ Novos códigos gerados! Guarde-os agora.</p>
                  <p className="text-xs">Cada código só pode ser usado uma vez se você perder acesso ao autenticador.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                      <code className={`flex-1 font-mono text-sm ${s.textPrimary}`}>{c}</code>
                      <button
                        type="button"
                        onClick={() => copyCode(c, i)}
                        className="text-gray-400 hover:text-brand-500 transition-colors flex-shrink-0"
                        title="Copiar este código"
                      >
                        {copiedIndex === i ? '✅' : '📋'}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copyAllBackupCodes} className={s.btnSecondary}>
                    📋 Copiar todos
                  </button>
                  <button type="button" onClick={downloadBackupCodes} className={s.btnSecondary}>
                    💾 Baixar .txt
                  </button>
                </div>
                {copyAllMsg && (
                  <div className={s.alertSuccess}>✅ Códigos copiados! Cole em um local seguro.</div>
                )}
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
                className={`w-36 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500`}
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
            {/* Aviso principal */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4">
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">
                ⚠️ Guarde esses códigos agora! Eles não serão mostrados novamente.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Use-os se perder acesso ao seu autenticador. Cada código só funciona uma vez.
              </p>
            </div>

            {/* Grid de códigos com botão de copiar individual */}
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  <code className={`flex-1 font-mono text-sm ${s.textPrimary}`}>{c}</code>
                  <button
                    type="button"
                    onClick={() => copyCode(c, i)}
                    className="text-gray-400 hover:text-brand-500 transition-colors flex-shrink-0"
                    title="Copiar este código"
                  >
                    {copiedIndex === i ? '✅' : '📋'}
                  </button>
                </div>
              ))}
            </div>

            {/* Ações de exportação */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyAllBackupCodes} className={s.btnSecondary}>
                📋 Copiar todos os códigos
              </button>
              <button type="button" onClick={downloadBackupCodes} className={s.btnSecondary}>
                💾 Baixar como .txt
              </button>
            </div>

            {copyAllMsg && (
              <div className={s.alertSuccess}>
                ✅ Códigos copiados! Cole em um local seguro.
              </div>
            )}

            {/* Aviso de confirmação + botão Concluir */}
            {!codesCopied && !codesDownloaded && (
              <p className={`text-xs ${s.textSecondary}`}>
                Confirme que salvou os códigos para continuar
              </p>
            )}
            <button
              onClick={() => setTotpStep('idle')}
              disabled={!codesCopied && !codesDownloaded}
              className={s.btnPrimary}
            >
              Concluir
            </button>
          </div>
        )}
      </section>

      {/* Modal: Desativar 2FA */}
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
