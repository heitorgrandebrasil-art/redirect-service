import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import {
  setupTotp, enableTotp, disableTotp, regenerateBackupCodes, changePassword,
  checkLinks, getSettings, updateLinkMonitor, updateOpenAIKey,
  saveGeminiKey, deleteGeminiKey, getVerificationHistory, LinkCheckItem,
} from '../lib/api';
import { s } from '../lib/styles';

export default function Settings() {
  const { user, setAuth } = useAuth();
  const qc = useQueryClient();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const changePw = useMutation({
    mutationFn: () => changePassword(currentPw, newPw),
    onSuccess: () => { setPwSuccess(true); setCurrentPw(''); setNewPw(''); setPwError(''); },
    onError: (e: any) => setPwError(e.response?.data?.message || 'Erro ao alterar senha')
  });

  const [totpStep, setTotpStep] = useState<'idle' | 'setup' | 'codes'>('idle');
  const [totpData, setTotpData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpError, setTotpError] = useState('');

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
    mutationFn: disableTotp,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        u.totp_enabled = false;
        const token = localStorage.getItem('access_token') ?? '';
        setAuth(token, u);
      }
    }
  });

  const regenCodes = useMutation({
    mutationFn: regenerateBackupCodes,
    onSuccess: (data) => setBackupCodes(data.backupCodes)
  });

  const [linkCheckResult, setLinkCheckResult] = useState<{ checked: number; broken: number; brokenItems: any[]; allResults: LinkCheckItem[] } | null>(null);
  const linkCheck = useMutation({
    mutationFn: checkLinks,
    onSuccess: (data) => setLinkCheckResult(data),
  });

  // Monitor settings
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
    onError: (e: any) => setMonitorError(e.response?.data?.message || 'Erro ao salvar configurações'),
  });

  // OpenAI key
  const [openAIKey, setOpenAIKey]     = useState('');
  const [openAISaved, setOpenAISaved] = useState(false);
  const saveOpenAI = useMutation({
    mutationFn: () => updateOpenAIKey(openAIKey),
    onSuccess: () => { setOpenAIKey(''); setOpenAISaved(true); settingsQ.refetch(); setTimeout(() => setOpenAISaved(false), 2500); },
  });

  // Gemini key
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'testing' | { ok: boolean; message: string }>('idle');
  const [geminiDeleteConfirm, setGeminiDeleteConfirm] = useState(false);

  const saveGemini = useMutation({
    mutationFn: () => saveGeminiKey(geminiKey),
    onMutate: () => setGeminiTestStatus('testing'),
    onSuccess: (data) => {
      if (data.test.ok) {
        setGeminiKey('');
        setGeminiTestStatus({ ok: true, message: 'Chave válida e funcionando!' });
        settingsQ.refetch();
      } else {
        setGeminiTestStatus({ ok: false, message: geminiErrorMessage(data.test.error, data.test.code) });
      }
    },
    onError: () => setGeminiTestStatus({ ok: false, message: 'Erro ao salvar a chave. Tente novamente.' }),
  });

  const removeGemini = useMutation({
    mutationFn: deleteGeminiKey,
    onSuccess: () => {
      setGeminiDeleteConfirm(false);
      setGeminiTestStatus({ ok: true, message: 'Chave apagada. Você pode adicionar uma nova chave a qualquer momento.' });
      settingsQ.refetch();
    },
  });

  function geminiErrorMessage(error?: string, code?: number | null): string {
    if (code === 401 || code === 403 || error?.includes('API_KEY_INVALID') || error?.includes('invalid')) {
      return 'Chave inválida. Verifique se copiou corretamente em aistudio.google.com';
    }
    if (code === 429 || error?.includes('quota') || error?.includes('RESOURCE_EXHAUSTED')) {
      return 'Limite de uso atingido. Aguarde alguns minutos ou verifique sua cota no Google AI Studio.';
    }
    if (error?.includes('fetch') || error?.includes('network') || error?.includes('ECONNREFUSED')) {
      return 'Não foi possível conectar à API do Gemini. Verifique sua conexão.';
    }
    return error ? `Erro: ${error}` : 'Erro desconhecido ao testar a chave.';
  }

  // Verification history
  const [showHistory, setShowHistory] = useState(false);
  const historyQ = useQuery({
    queryKey: ['verification-history'],
    queryFn: getVerificationHistory,
    enabled: showHistory && user?.role === 'admin',
  });

  return (
    <div className={`${s.page} max-w-2xl`}>
      <div className="mb-8">
        <h1 className={s.h1}>Configurações</h1>
        <p className={s.sub}>{user?.email} · {user?.role}</p>
      </div>

      {/* Change password */}
      <section className={`${s.cardPad} mb-6`}>
        <h2 className={`font-semibold ${s.textPrimary} mb-4`}>Alterar senha</h2>
        {pwSuccess && <div className={`${s.alertSuccess} mb-4`}>Senha alterada com sucesso!</div>}
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
                {monitorSaved && <span className="text-xs text-green-600 dark:text-green-400">✓ Salvo</span>}
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

          {/* OpenAI */}
          <div className="space-y-3 mb-6">
            <div>
              <label className={s.label}>OpenAI API Key</label>
              <input
                type="password"
                value={openAIKey}
                onChange={(e) => setOpenAIKey(e.target.value)}
                placeholder={settingsQ.data?.openai_key_set ? '••••••••••••• (já configurada)' : 'sk-...'}
                className={s.inputMono}
                autoComplete="off"
              />
              <p className={s.hint}>
                {settingsQ.data?.openai_key_set
                  ? 'Uma chave já está salva. Preencha para substituí-la.'
                  : 'Salva de forma criptografada no banco de dados.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => saveOpenAI.mutate()} disabled={saveOpenAI.isPending || !openAIKey.trim()} className={s.btnPrimary}>
                {saveOpenAI.isPending ? 'Salvando...' : 'Salvar chave'}
              </button>
              {openAISaved && <span className="text-xs text-green-600 dark:text-green-400">✓ Salvo</span>}
            </div>
          </div>

          {/* Gemini */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-3">
            <div>
              <label className={s.label}>Gemini API Key</label>
              {settingsQ.data?.gemini_key_set && (
                <p className={`text-xs ${s.textMuted} mb-1`}>
                  Chave configurada: ●●●●●●●●●●●●{settingsQ.data.gemini_key_last4}
                  {settingsQ.data.gemini_key_updated_at && (
                    <span className="ml-2">
                      · atualizada em {new Date(settingsQ.data.gemini_key_updated_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </p>
              )}
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => { setGeminiKey(e.target.value); setGeminiTestStatus('idle'); }}
                placeholder={settingsQ.data?.gemini_key_set ? 'Cole aqui para substituir a chave atual' : 'AIza...'}
                className={s.inputMono}
                autoComplete="off"
              />
              {!settingsQ.data?.gemini_key_set && (
                <p className={s.hint}>
                  Obtenha sua chave em <span className="font-mono">aistudio.google.com</span>. Salva de forma criptografada.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => saveGemini.mutate()}
                disabled={saveGemini.isPending || !geminiKey.trim()}
                className={s.btnPrimary}
              >
                {saveGemini.isPending ? 'Testando...' : 'Salvar e Testar'}
              </button>
              {settingsQ.data?.gemini_key_set && !geminiDeleteConfirm && (
                <button
                  onClick={() => setGeminiDeleteConfirm(true)}
                  className={s.btnDanger}
                >
                  Apagar chave
                </button>
              )}
              {geminiDeleteConfirm && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${s.textSecondary}`}>Confirmar?</span>
                  <button
                    onClick={() => removeGemini.mutate()}
                    disabled={removeGemini.isPending}
                    className={`${s.btnDanger} text-xs py-1 px-2`}
                  >
                    Sim, apagar
                  </button>
                  <button
                    onClick={() => setGeminiDeleteConfirm(false)}
                    className={`${s.btnSecondary} text-xs py-1 px-2`}
                  >
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

            {!settingsQ.data?.gemini_key_set && geminiTestStatus === 'idle' && (
              <p className={`text-xs ${s.textMuted}`}>
                💡 Com a chave Gemini configurada, links em revisão humana são analisados automaticamente por visão computacional.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Link health check — admin only */}
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

      {/* Histórico de verificações — admin only */}
      {user?.role === 'admin' && (
        <section className={`${s.cardPad} mb-6`}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`flex items-center justify-between w-full text-left`}
          >
            <h2 className={`font-semibold ${s.textPrimary}`}>Histórico de verificações</h2>
            <span className={s.textMuted}>{showHistory ? '▲' : '▼'}</span>
          </button>

          {showHistory && (
            <div className="mt-4">
              {historyQ.isLoading && <p className={`text-sm ${s.textMuted}`}>Carregando...</p>}
              {historyQ.data && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Total feedbacks', value: historyQ.data.total },
                      {
                        label: 'Acerto Gemini',
                        value: historyQ.data.gemini_total > 0
                          ? `${Math.round((historyQ.data.gemini_correct / historyQ.data.gemini_total) * 100)}%`
                          : '—',
                      },
                      { label: 'Confirmados OK', value: historyQ.data.human_ok },
                      { label: 'Confirmados Quebrado', value: historyQ.data.human_broken },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-center">
                        <p className={`text-xl font-semibold ${s.textPrimary}`}>{value}</p>
                        <p className={`text-xs ${s.textMuted} mt-0.5`}>{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Feedbacks list */}
                  {historyQ.data.feedbacks.length === 0 ? (
                    <p className={`text-sm ${s.textMuted}`}>Nenhum feedback registrado ainda.</p>
                  ) : (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {historyQ.data.feedbacks.map((fb) => (
                          <div key={fb.id} className="px-4 py-2.5 flex items-center gap-3">
                            <span>{fb.human_said === 'ok' ? '✅' : '❌'}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`font-medium ${s.textPrimary} truncate`}>
                                {fb.product_title ?? fb.url}
                              </p>
                              <div className="flex gap-2 flex-wrap mt-0.5">
                                {fb.marketplace && <span className={s.textMuted}>{fb.marketplace}</span>}
                                {fb.gemini_said && (
                                  <span className={fb.gemini_said === fb.human_said ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                                    🤖 {fb.gemini_said}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={s.textMuted}>
                              {new Date(fb.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
              onClick={() => { if (confirm('Desativar 2FA?')) disable.mutate(); }}
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
              <div className="mt-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <p className={`text-xs ${s.textSecondary} mb-2 font-medium`}>Novos códigos (guarde em local seguro):</p>
                <div className="grid grid-cols-2 gap-1">
                  {backupCodes.map((c, i) => (
                    <code key={i} className={s.codeTag}>{c}</code>
                  ))}
                </div>
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
          <div>
            <div className={`${s.alertWarn} mb-4`}>
              <p className="font-semibold mb-1">2FA ativado!</p>
              <p className="text-xs">
                Guarde estes códigos de backup em local seguro. Cada código pode ser usado uma vez se você perder acesso ao seu autenticador.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((c, i) => (
                <code key={i} className={`${s.codeTag} text-sm py-2 text-center block`}>{c}</code>
              ))}
            </div>
            <button onClick={() => setTotpStep('idle')} className={`mt-4 ${s.btnPrimary}`}>
              Concluir
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
