import { useState, FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import {
  setupTotp, enableTotp, disableTotp, regenerateBackupCodes, changePassword,
  checkLinks, getSettings, updateLinkMonitor, updateOpenAIKey,
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

  const [linkCheckResult, setLinkCheckResult] = useState<{ checked: number; broken: number; brokenItems: any[] } | null>(null);
  const linkCheck = useMutation({
    mutationFn: checkLinks,
    onSuccess: (data) => setLinkCheckResult(data),
  });

  // Monitor settings
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings, enabled: user?.role === 'admin' });
  const [monitorEnabled, setMonitorEnabled] = useState(false);
  const [monitorFreq, setMonitorFreq]       = useState(24);
  const [monitorHour, setMonitorHour]       = useState(8);
  const [monitorSaved, setMonitorSaved]     = useState(false);

  // Sync state from fetched settings
  if (settingsQ.data && !monitorSaved && !settingsQ.isFetching) {
    const m = settingsQ.data.monitor;
    if (m.enabled !== monitorEnabled || m.frequency_hours !== monitorFreq || m.preferred_hour !== monitorHour) {
      setMonitorEnabled(m.enabled);
      setMonitorFreq(m.frequency_hours);
      setMonitorHour(m.preferred_hour);
    }
  }

  const saveMonitor = useMutation({
    mutationFn: () => updateLinkMonitor({ enabled: monitorEnabled, frequency_hours: monitorFreq, preferred_hour: monitorHour }),
    onSuccess: () => { setMonitorSaved(true); settingsQ.refetch(); setTimeout(() => setMonitorSaved(false), 2500); },
  });

  // OpenAI key
  const [openAIKey, setOpenAIKey]     = useState('');
  const [openAISaved, setOpenAISaved] = useState(false);
  const saveOpenAI = useMutation({
    mutationFn: () => updateOpenAIKey(openAIKey),
    onSuccess: () => { setOpenAIKey(''); setOpenAISaved(true); settingsQ.refetch(); setTimeout(() => setOpenAISaved(false), 2500); },
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
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              className={s.input}
            />
          </div>
          <div>
            <label className={s.label}>Nova senha (mín. 8 caracteres)</label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              minLength={8}
              className={s.input}
            />
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={s.label}>Frequência</label>
                <select value={monitorFreq} onChange={(e) => setMonitorFreq(Number(e.target.value))} className={s.select}>
                  <option value={1}>A cada 1 hora</option>
                  <option value={6}>A cada 6 horas</option>
                  <option value={12}>A cada 12 horas</option>
                  <option value={24}>A cada 24 horas</option>
                  <option value={48}>A cada 48 horas</option>
                </select>
              </div>
              <div>
                <label className={s.label}>Horário preferido</label>
                <select value={monitorHour} onChange={(e) => setMonitorHour(Number(e.target.value))} className={s.select}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                  ))}
                </select>
              </div>
            </div>
            {settingsQ.data?.monitor.last_run && (
              <p className={`text-xs ${s.textMuted}`}>
                Última verificação: {new Date(settingsQ.data.monitor.last_run).toLocaleString('pt-BR')}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button onClick={() => saveMonitor.mutate()} disabled={saveMonitor.isPending} className={s.btnPrimary}>
                {saveMonitor.isPending ? 'Salvando...' : 'Salvar configurações'}
              </button>
              {monitorSaved && <span className="text-xs text-green-600 dark:text-green-400">✓ Salvo</span>}
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
              <button
                onClick={() => saveOpenAI.mutate()}
                disabled={saveOpenAI.isPending || !openAIKey.trim()}
                className={s.btnPrimary}
              >
                {saveOpenAI.isPending ? 'Salvando...' : 'Salvar chave'}
              </button>
              {openAISaved && <span className="text-xs text-green-600 dark:text-green-400">✓ Salvo</span>}
            </div>
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
            <div className="mt-4">
              {linkCheckResult.broken === 0 ? (
                <div className={s.alertSuccess}>
                  ✅ Todos os {linkCheckResult.checked} links estão funcionando.
                </div>
              ) : (
                <div className={s.alertError}>
                  ❌ {linkCheckResult.broken} link(s) quebrado(s) de {linkCheckResult.checked} verificados.
                  <ul className="mt-2 space-y-1 text-xs">
                    {linkCheckResult.brokenItems.map((item: any) => (
                      <li key={item.id} className="font-mono truncate">
                        {item.url} <span className="opacity-70">(HTTP {item.status || 'erro'})</span>
                      </li>
                    ))}
                  </ul>
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
