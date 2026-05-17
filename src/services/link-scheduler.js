import { getSettingJson, setSettingJson } from './settings-service.js';
import { checkAllLinks } from './link-health.js';
import logger from '../logger.js';

const DEFAULTS = { enabled: false, frequency_hours: 24, preferred_hour: 8, last_run: null };

class LinkScheduler {
  constructor() { this._timer = null; }

  async reload() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }

    let cfg;
    try { cfg = (await getSettingJson('link_monitor')) ?? DEFAULTS; }
    catch (err) { logger.warn({ event: 'scheduler.settings.error', error: err.message }); return; }

    if (!cfg.enabled) { logger.info({ event: 'scheduler.disabled' }); return; }

    const delay = this._nextDelay(cfg);
    logger.info({ event: 'scheduler.scheduled', nextRunAt: new Date(Date.now() + delay).toISOString() });

    this._timer = setTimeout(async () => {
      this._timer = null;
      logger.info({ event: 'scheduler.running' });
      try {
        await checkAllLinks();
        const current = (await getSettingJson('link_monitor')) ?? DEFAULTS;
        await setSettingJson('link_monitor', { ...current, last_run: new Date().toISOString() });
      } catch (err) {
        logger.error({ event: 'scheduler.run.error', error: err.message });
      }
      await this.reload();
    }, delay);
  }

  _nextDelay({ frequency_hours, preferred_hour, last_run }) {
    const freqMs = frequency_hours * 60 * 60 * 1000;
    const now = Date.now();

    if (last_run) {
      const next = new Date(last_run).getTime() + freqMs;
      if (next > now) return Math.max(next - now, 60_000);
    }

    // Overdue or never ran — fire at next preferred_hour
    const at = new Date();
    at.setHours(preferred_hour, 0, 0, 0);
    if (at.getTime() <= now) at.setDate(at.getDate() + 1);
    return Math.min(at.getTime() - now, freqMs);
  }

  stop() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
}

export const linkScheduler = new LinkScheduler();
