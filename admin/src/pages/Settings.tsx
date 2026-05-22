import { useState, useEffect, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import {
  setupTotp, enableTotp, disableTotp, regenerateBackupCodes, changePassword,
  checkLinks, getSettings, updateLinkMonitor,
  saveGeminiKey, deleteGeminiKey, testCurrentGeminiKey, getHistoryStats, LinkCheckItem,
} from '../lib/api';
import { s } from '../lib/styles';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days} dia${days !== 1 ? 's' : ''}`;
}

// ── Animated status dot ───────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'ok' | 'error' | 'untested' | 'testing' }) {
  if (status === 'ok') {
    return (
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
    );
  }
  if (status === 'testing') {
    return (
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-brand-500" />
      </span>
    );
  }
  if (status === 'error') {
    return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-red-500 flex-shrink-0" />;
  }
  return <span className="inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 flex-shrink-0" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

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

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [codesCopied, setCodesCopied] = useState(false);
  const [codesDownloaded, setCodesDownloaded] = useState(false);
  const [copyAllMsg, setCopyAllMsg] = useState(false);

  const [disableModal, setDisableModal] = useState(false);
  const [disablePw, setDisablePw] = useState('');
  const [disableError, setDisableError] = useState('');

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
  const isAdmin = user?.role === 'admin';
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings, enabled: isAdmin });
  const historyStatsQ = useQuery({ queryKey: ['historyStats'], queryFn: getHistoryStats, enabled: isAdmin });

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
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiSaveStatus, setGeminiSaveStatus] = useState<'idle' | { ok: boolean; message: string }>('idle');
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'testing' | { ok: boolean; message: string }>('idle');
  const [geminiDeleteConfirm, setGeminiDeleteConfirm] = useState(false);

  const saveGemini = useMutation({
    mutationFn: () => saveGeminiKey(geminiKey),
    onSuccess: () => {
      setGeminiKey('');
      setGeminiSaveStatus({ ok: true, message: '✅ Chave salva com sucesso!' });
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
        setGeminiTestStatus({ ok: true, message: '✅ Gemini conectado e funcionando!' });
        settingsQ.refetch();
      } else {
        setGeminiTestStatus({ ok: false, message: geminiErrorMessage(data.test.error, data.test.code, data.test.isFreeTierExhausted) });
      }
    },
    onError: () => setGeminiTestStatus({ ok: false, message: '❌ Não foi possível conectar. Verifique a chave.' }),
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
        return 'Chave válida, mas cota gratuita diária esgotada. O Gemini vai funcionar normalmente amanhã quando a cota resetar.';
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

  // — Derived Gemini connection status —
  const connStatus: 'none' | 'ok' | 'error' | 'untested' | 'testing' = (() => {
    if (!settingsQ.data?.gemini_key_set) return 'none';
    if (geminiTestStatus === 'testing') return 'testing';
    if (geminiTestStatus !== 'idle') return geminiTestStatus.ok ? 'ok' : 'error';
    return settingsQ.data.gemini_key_updated_at ? 'ok' : 'untested';
  })();

  const connErrorMsg =
    geminiTestStatus !== 'idle' && geminiTestStatus !== 'testing' && !geminiTestStatus.ok
      ? geminiTestStatus.message
      : '';

  const connSuccessMsg =
    geminiTestStatus !== 'idle' && geminiTestStatus !== 'testing' && geminiTestStatus.ok
      ? geminiTestStatus.message
      : '';

  // ─────────────────────────────────────────────────────────────────────────────

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
      {isAdmin && (
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

      {/* ═══ Inteligência Artificial — Gemini Vision ═══ */}
      {isAdmin && (
        <section className={`${s.cardPad} mb-6`}>

          {/* Header */}
          <div className="flex items-start gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🤖</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className={`font-semibold ${s.textPrimary}`}>Gemini Vision</h2>
              <p className={`text-xs ${s.textSecondary} mt-0.5 leading-relaxed`}>
                Analisa páginas visualmente quando o verificador automático não consegue identificar o status
              </p>
            </div>
          </div>

          {/* ── Status indicator (only when key exists) ── */}
          {connStatus !== 'none' && (
            <div className={`rounded-lg border p-3.5 mb-5 transition-colors ${
              connStatus === 'ok'
                ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20'
                : connStatus === 'error'
                  ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
                  : connStatus === 'testing'
                    ? 'bg-brand-50 dark:bg-brand-500/10 border-brand-200 dark:border-brand-500/20'
                    : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
            }`}>
              <div className="flex items-center gap-2">
                <StatusDot status={connStatus === 'testing' ? 'testing' : connStatus as any} />
                <span className={`text-sm font-medium ${
                  connStatus === 'ok'      ? 'text-green-700 dark:text-green-400'
                  : connStatus === 'error' ? 'text-red-700 dark:text-red-400'
                  : connStatus === 'testing' ? 'text-brand-700 dark:text-brand-400'
                  : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {connStatus === 'ok'       && 'Conectado e funcionando'}
                  {connStatus === 'error'    && 'Erro na conexão'}
                  {connStatus === 'testing'  && 'Testando conexão...'}
                  {connStatus === 'untested' && 'Chave salva — não testada ainda'}
                </span>
              </div>

              {/* Detail line */}
              {connStatus === 'ok' && (
                <div className={`mt-1.5 ml-4 text-xs text-green-600/80 dark:text-green-400/70 space-y-0.5`}>
                  {connSuccessMsg && <p>{connSuccessMsg}</p>}
                  {settingsQ.data?.gemini_key_updated_at && !connSuccessMsg && (
                    <p>
                      Último teste bem-sucedido:{' '}
                      {new Date(settingsQ.data.gemini_key_updated_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  )}
                  <p className="text-green-600/60 dark:text-green-400/50">Modelo: gemini-2.0-flash</p>
                </div>
              )}
              {connStatus === 'untested' && (
                <p className="mt-1 ml-4 text-xs text-amber-600/80 dark:text-amber-400/70">
                  Clique em "Testar conexão" para verificar
                </p>
              )}
              {connStatus === 'error' && connErrorMsg && (
                <p className="mt-1 ml-4 text-xs text-red-600/80 dark:text-red-400/70">{connErrorMsg}</p>
              )}
            </div>
          )}

          {/* ── No key yet: amber notice ── */}
          {connStatus === 'none' && (
            <div className="rounded-lg p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                ⚠️ Nenhuma chave cadastrada. Sistema usando apenas Playwright para verificação.
              </p>
            </div>
          )}

          {/* ── API Key input ── */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className={s.label}>Chave de API</label>
              <button
                type="button"
                onClick={() => setShowGeminiKey((v) => !v)}
                className={`text-xs ${s.textMuted} hover:${s.textSecondary} transition-colors`}
              >
                {showGeminiKey ? '🙈 ocultar' : '👁 mostrar'}
              </button>
            </div>
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => { setGeminiKey(e.target.value); setGeminiSaveStatus('idle'); }}
              placeholder={
                settingsQ.data?.gemini_key_set
                  ? `●●●●●●●●${settingsQ.data.gemini_key_last4 ?? ''}  (deixe vazio para manter)`
                  : 'Cole sua chave do Gemini aqui'
              }
              className={s.inputMono}
              autoComplete="off"
            />
            <p className={s.hint}>
              Obtenha em <span className="font-mono">aistudio.google.com</span>
              {settingsQ.data?.gemini_key_set ? ' · salva de forma criptografada' : ' · será salva de forma criptografada'}.
            </p>
          </div>

          {/* Save new key */}
          {geminiKey.trim() && (
            <div className="mb-4 space-y-2">
              <button
                onClick={() => saveGemini.mutate()}
                disabled={saveGemini.isPending}
                className={s.btnPrimary}
              >
                {saveGemini.isPending ? 'Salvando...' : 'Salvar chave'}
              </button>
              {geminiSaveStatus !== 'idle' && (
                <div className={geminiSaveStatus.ok ? s.alertSuccess : s.alertError}>
                  {geminiSaveStatus.message}
                </div>
              )}
            </div>
          )}

          {/* ── Action buttons ── */}
          {settingsQ.data?.gemini_key_set && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => testCurrentKey.mutate()}
                disabled={geminiTestStatus === 'testing'}
                className={s.btnSecondary}
              >
                {geminiTestStatus === 'testing' ? '⏳ Testando...' : '🔄 Testar conexão'}
              </button>

              {!geminiDeleteConfirm ? (
                <button onClick={() => setGeminiDeleteConfirm(true)} className={s.btnDanger}>
                  🗑️ Apagar chave
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${s.textSecondary}`}>Confirmar exclusão?</span>
                  <button
                    onClick={() => removeGemini.mutate()}
                    disabled={removeGemini.isPending}
                    className={`${s.btnDanger} text-xs`}
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
          )}

          {/* ── Uso do mês ── */}
          <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/[0.06]">
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${s.textMuted} mb-3`}>
              📊 Uso do mês
            </p>
            <div className="grid grid-cols-2 gap-4 mb-2">
              <div>
                <p className={`text-xs ${s.textMuted} mb-0.5`}>Chamadas realizadas</p>
                <p className={`text-lg font-semibold ${s.textPrimary}`}>
                  {historyStatsQ.data?.summary.gemini_calls ?? 0}
                </p>
              </div>
              <div>
                <p className={`text-xs ${s.textMuted} mb-0.5`}>Acerto da IA</p>
                <p className={`text-lg font-semibold ${s.textPrimary}`}>
                  {historyStatsQ.data?.summary.gemini_accuracy != null
                    ? `${Math.round(historyStatsQ.data.summary.gemini_accuracy * 100)}%`
                    : <span className={s.textMuted}>—</span>}
                </p>
                {!historyStatsQ.data?.summary.gemini_accuracy && (
                  <p className={`text-xs ${s.textMuted}`}>sem dados ainda</p>
                )}
              </div>
            </div>
            <p className={`text-xs ${s.textMuted} leading-relaxed`}>
              Gemini é acionado apenas como fallback quando o verificador automático tem dúvida sobre o status de um link.
            </p>
          </div>
        </section>
      )}

      {/* ═══ Verificar links quebrados ═══ */}
      {isAdmin && (
        <section className={`${s.cardPad} mb-6`}>
          <div className="flex items-start gap-2 mb-1">
            <h2 className={`font-semibold ${s.textPrimary}`}>🔍 Verificar links quebrados</h2>
          </div>
          <p className={`text-sm ${s.textSecondary} mb-1`}>
            Força uma verificação imediata em todos os links.
          </p>
          <p className={`text-xs ${s.textMuted} mb-4`}>
            Normalmente o sistema verifica automaticamente conforme a prioridade de cada link.
          </p>

          {settingsQ.data?.monitor.last_run && (
            <p className={`text-xs ${s.textMuted} mb-3`}>
              Última verificação: {formatRelativeTime(settingsQ.data.monitor.last_run)}
              {' '}·{' '}
              <span className="opacity-70">
                {new Date(settingsQ.data.monitor.last_run).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </p>
          )}

          <button
            onClick={() => { setLinkCheckResult(null); linkCheck.mutate(); }}
            disabled={linkCheck.isPending}
            className={s.btnPrimary}
          >
            {linkCheck.isPending ? '⏳ Verificando...' : '🔍 Verificar agora'}
          </button>

          {linkCheckResult && (
            <div className="mt-4 space-y-3">
              <div className={`${linkCheckResult.broken === 0 ? s.alertSuccess : s.alertError} flex items-center justify-between`}>
                <span>
                  {linkCheckResult.broken === 0
                    ? `✅ Todos os ${linkCheckResult.checked} links estão funcionando.`
                    : `❌ ${linkCheckResult.broken} link(s) quebrado(s) de ${linkCheckResult.checked} verificados.`}
                </span>
                <button
                  onClick={() => setLinkCheckResult(null)}
                  className="ml-4 opacity-60 hover:opacity-100 font-bold leading-none"
                >
                  ✕
                </button>
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
                <div className={s.alertWarn}>
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
