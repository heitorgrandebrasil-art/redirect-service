import axios from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const verifyTotp = (tempToken: string, code: string) =>
  api.post('/auth/verify-totp', { tempToken, code }).then((r) => r.data);

export const getMe = () => api.get('/auth/me').then((r) => r.data.data);

export const setupTotp = () => api.post('/auth/setup-totp').then((r) => r.data.data);
export const enableTotp = (code: string) =>
  api.post('/auth/enable-totp', { code }).then((r) => r.data.data);
export const disableTotp = () => api.post('/auth/disable-totp').then((r) => r.data);
export const regenerateBackupCodes = () =>
  api.post('/auth/regenerate-backup-codes').then((r) => r.data.data);
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data);

// Users (admin only)
export const listUsers = () => api.get('/users').then((r) => r.data.data);
export const createUser = (data: { email: string; password: string; role: string }) =>
  api.post('/users', data).then((r) => r.data.data);
export const deleteUser = (id: number) =>
  api.delete(`/users/${id}`).then((r) => r.data.data);
export const updateUserRole = (id: number, role: string) =>
  api.patch(`/users/${id}/role`, { role }).then((r) => r.data.data);

// Profiles
export const listProfiles = () => api.get('/profiles').then((r) => r.data.data);
export const getProfile = (id: number) =>
  api.get(`/profiles/${id}`).then((r) => r.data.data);
export const createProfile = (data: ProfilePayload) =>
  api.post('/profiles', data).then((r) => r.data.data);
export const updateProfile = (id: number, data: Partial<ProfilePayload>) =>
  api.patch(`/profiles/${id}`, data).then((r) => r.data.data);
export const deleteProfile = (id: number) =>
  api.delete(`/profiles/${id}`).then((r) => r.data.data);
export const testTelegramBot = (id: number) =>
  api.post(`/profiles/${id}/test-telegram`).then((r) => r.data);

// Videos (campaigns)
export const listVideos = () => api.get('/videos').then((r) => r.data.data);
export const getVideo = (id: number) =>
  api.get(`/videos/${id}`).then((r) => r.data.data);
export const createVideo = (data: VideoPayload) =>
  api.post('/videos', data).then((r) => r.data.data);
export const updateVideo = (id: number, data: Partial<VideoPayload>) =>
  api.patch(`/videos/${id}`, data).then((r) => r.data.data);
export const deleteVideo = (id: number) =>
  api.delete(`/videos/${id}`).then((r) => r.data.data);
export const listVideoProducts = (id: number) =>
  api.get(`/videos/${id}/products`).then((r) => r.data.data);
export const createVideoProduct = (id: number, data: ProductPayload) =>
  api.post(`/videos/${id}/products`, data).then((r) => r.data.data);

// Products
export const updateProduct = (id: number, data: Partial<ProductPayload>) =>
  api.patch(`/products/${id}`, data).then((r) => r.data.data);
export const deleteProduct = (id: number) =>
  api.delete(`/products/${id}`).then((r) => r.data.data);
export const replaceProductLink = (id: number, affiliate_url: string) =>
  api.post(`/products/${id}/replace-link`, { affiliate_url }).then((r) => r.data.data);

// Config (public, no auth)
export const getConfig = () => api.get('/config').then((r) => r.data as { publicBaseUrl: string });

// Domains
export const listDomains = () => api.get('/domains').then((r) => r.data.data);
export const createDomain = (name: string, hostname: string) =>
  api.post('/domains', { name, hostname }).then((r) => r.data.data);
export const deleteDomain = (id: number) =>
  api.delete(`/domains/${id}`).then((r) => r.data.data);

// Analytics
export const getAnalyticsOverview = () =>
  api.get('/analytics/overview').then((r) => r.data.data as {
    byDevice: { device: string; clicks: number }[];
    byPlatform: { platform: string; clicks: number }[];
    topCampaigns: { id: number; title: string; platform: string; clicks: number }[];
    totals: {
      total_clicks: number; total_campaigns: number; total_profiles: number;
      total_links: number; links_ok: number; links_broken: number;
    };
    byDay: { date: string; clicks: number }[];
    linkStatus: { status: string; count: number }[];
  });

// Broken links
export interface BrokenLinkItem {
  id: number;
  title: string;
  affiliate_url: string;
  short_path: string;
  marketplace: string;
  position: string;
  link_status: string;
  link_broken_at: string | null;
  link_last_status_code: number | null;
  link_last_checked_at: string | null;
  awaiting_confirmation: boolean;
  snoozed_until: string | null;
  last_gemini_status: string | null;
  last_gemini_confidence: number | null;
  video_id: number;
  video_title: string;
  platform: string;
  profile_id: number | null;
  profile_name: string | null;
  domain_hostname: string | null;
}
export const getBrokenLinks = () =>
  api.get('/broken-links').then((r) => r.data.data as BrokenLinkItem[]);
export const markProductFixed = (id: number) =>
  api.post(`/products/${id}/mark-fixed`).then((r) => r.data);
export const snoozeProduct = (id: number) =>
  api.post(`/products/${id}/snooze`).then((r) => r.data);
export const toggleProductMonitoring = (id: number, enabled: boolean) =>
  api.patch(`/products/${id}/monitoring`, { enabled }).then((r) => r.data);

// Admin tools
export interface LinkCheckItem {
  id: number; title: string; campaign: string;
  marketplace: string; position: string; url: string; ok: boolean; status: number;
}
export const checkLinks = () =>
  api.post('/admin/check-links').then((r) => r.data.data as {
    checked: number; broken: number;
    brokenItems: { id: number; url: string; status: number }[];
    allResults: LinkCheckItem[];
  });

export const checkVideoLinks = (id: number) =>
  api.post(`/videos/${id}/check-links`).then((r) => r.data.data as {
    checked: number; broken: number;
    results: { id: number; title: string; position: string; marketplace: string; url: string; ok: boolean; status: number }[];
  });

export const checkProductLink = (id: number) =>
  api.post(`/admin/links/${id}/check`).then((r) => r.data.data as {
    ok: boolean; humanReview: boolean; httpStatus: number; linkStatus: string;
  });

export const submitProductFeedback = (id: number, verdict: 'ok' | 'broken') =>
  api.post(`/products/${id}/feedback`, { verdict }).then((r) => r.data);

// Settings (admin)
export interface SettingsData {
  monitor: { enabled: boolean; frequency_hours: number; last_run: string | null };
  gemini_key_set: boolean;
  gemini_key_last4: string | null;
  gemini_key_updated_at: string | null;
}
export const getSettings = () =>
  api.get('/settings').then((r) => r.data.data as SettingsData);
export const updateLinkMonitor = (data: { enabled?: boolean; frequency_hours?: number }) =>
  api.patch('/settings/monitor', data).then((r) => r.data.data);
export const saveGeminiKey = (api_key: string) =>
  api.post('/settings/gemini-key', { api_key }).then((r) => r.data as { status: string; test: { ok: boolean; error?: string; code?: number | null } });
export const deleteGeminiKey = () =>
  api.delete('/settings/gemini-key').then((r) => r.data);

export interface VerificationHistory {
  total: number;
  gemini_total: number;
  gemini_correct: number;
  gemini_uncertain: number;
  human_ok: number;
  human_broken: number;
  feedbacks: Array<{
    id: number; url: string; marketplace: string | null;
    playwright_said: string | null; gemini_said: string | null;
    human_said: string; created_at: string; product_title: string | null;
  }>;
}
export const getVerificationHistory = () =>
  api.get('/settings/verification-history').then((r) => r.data.data as VerificationHistory);

// Types
export interface ProfilePayload {
  name: string;
  platform: string;
  domain_id?: number | null;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
}

export interface VideoPayload {
  title: string;
  platform?: string;
  original_video_url?: string;
  description?: string;
  notes?: string;
  publish_date?: string;
  profile_id?: number | null;
}

export interface ProductPayload {
  title: string;
  affiliate_url: string;
  marketplace: string;
  short_path?: string;
  position?: string;
  domain_id?: number | null;
  description?: string;
}
