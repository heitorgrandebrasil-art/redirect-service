import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listVideos, createVideo, deleteVideo, listProfiles, type VideoPayload } from '../lib/api';
import { s } from '../lib/styles';

const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'x', 'outro'];
const PLATFORM_COLORS: Record<string, string> = {
  youtube: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  instagram: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  tiktok: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  facebook: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  x: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
};

const EMPTY: VideoPayload = { title: '', platform: 'youtube', original_video_url: '', profile_id: null };

export default function Campaigns() {
  const qc = useQueryClient();
  const videos = useQuery({ queryKey: ['videos'], queryFn: listVideos });
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });

  const [form, setForm] = useState<VideoPayload>(EMPTY);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [profileFilter, setProfileFilter] = useState<number | ''>('');
  const [sortKey, setSortKey] = useState<'broken' | 'clicks'>('broken');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const create = useMutation({
    mutationFn: () => createVideo(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['videos'] }); closeModal(); },
    onError: (e: any) => setError(e.response?.data?.message || '❌ Não foi possível criar a campanha. Tente de novo.'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => deleteVideo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['videos'] }),
  });

  function openCreate() { setForm(EMPTY); setError(''); setShowModal(true); }
  function closeModal() { setShowModal(false); }
  function field(key: keyof VideoPayload, value: any) { setForm((f) => ({ ...f, [key]: value })); }

  function toggleSort(key: 'broken' | 'clicks') {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const profileMap = new Map((profiles.data ?? []).map((p: any) => [p.id, p]));
  const filtered = (videos.data ?? [])
    .filter((v: any) => {
      if (profileFilter !== '' && v.profile_id !== profileFilter) return false;
      if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    })
    .sort((a: any, b: any) => {
      const val = (v: any) => sortKey === 'broken'
        ? (v.broken_links_count ?? 0)
        : (v.total_clicks ?? 0);
      return sortDir === 'desc' ? val(b) - val(a) : val(a) - val(b);
    });

  return (
    <div className={s.page}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={s.h1}>Campanhas</h1>
          <p className={s.sub}>Vídeos e links afiliados</p>
        </div>
        <button onClick={openCreate} className={s.btnPrimary}>+ Nova campanha</button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campanhas..."
          className="w-72 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Todos os perfis</option>
          {(profiles.data ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {(search || profileFilter !== '') && (
          <button
            onClick={() => { setSearch(''); setProfileFilter(''); }}
            className={`text-sm ${s.textMuted} hover:text-gray-700 dark:hover:text-gray-300`}
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className={s.tableWrap}>
        <table className="w-full">
          <thead className={s.thead}>
            <tr>
              <th className={s.th}>Título</th>
              <th className={s.th}>Plataforma</th>
              <th className={s.th}>Perfil</th>
              <th
                className={`${s.th} cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200`}
                onClick={() => toggleSort('clicks')}
              >
                Cliques {sortKey === 'clicks' ? (sortDir === 'desc' ? '↓' : '↑') : <span className="opacity-30">↕</span>}
              </th>
              <th
                className={`${s.th} cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200`}
                onClick={() => toggleSort('broken')}
              >
                Links Quebrados {sortKey === 'broken' ? (sortDir === 'desc' ? '↓' : '↑') : <span className="opacity-30">↕</span>}
              </th>
              <th className={s.th} />
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {filtered.map((v: any) => {
              const profile = profileMap.get(v.profile_id);
              return (
                <tr key={v.id} className={s.tr}>
                  <td className="px-6 py-4">
                    <Link
                      to={`/admin/campaigns/${v.id}`}
                      className="text-base font-semibold text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      {v.title}
                    </Link>
                    {v.original_video_url && (
                      <a
                        href={v.original_video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-gray-400 dark:text-gray-500 hover:text-brand-500 mt-0.5 truncate max-w-xs"
                      >
                        {v.original_video_url}
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {v.platform && (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[v.platform?.toLowerCase()] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                        {v.platform}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                    {profile ? (profile as any).name : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {(v.total_clicks ?? 0).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      {(v.broken_links_count ?? 0) > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                          {v.broken_links_count}
                        </span>
                      ) : (
                        <span className={`text-sm ${s.textMuted}`}>0</span>
                      )}
                      {(v.human_review_count ?? 0) > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 bg-orange-500 text-white text-xs font-bold rounded-full">
                          {v.human_review_count}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/campaigns/${v.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-700 rounded-md hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                      >
                        Ver links
                      </Link>
                      <button
                        onClick={() => { if (confirm('Excluir esta campanha?')) remove.mutate(v.id); }}
                        className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className={`px-6 py-10 text-center ${s.textMuted} text-sm`}>
                  {search || profileFilter !== '' ? 'Nenhuma campanha encontrada.' : 'Nenhuma campanha cadastrada ainda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={s.overlay}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h2 className={s.modalTitle}>Nova campanha</h2>
            </div>
            <div className={s.modalBody}>
              {error && <div className={s.alertError}>{error}</div>}
              <div>
                <label className={s.label}>Título do vídeo / conteúdo</label>
                <input
                  value={form.title}
                  onChange={(e) => field('title', e.target.value)}
                  className={s.input}
                  placeholder="Ex: Review do produto X"
                />
              </div>
              <div>
                <label className={s.label}>Plataforma do conteúdo</label>
                <select value={form.platform ?? ''} onChange={(e) => field('platform', e.target.value)} className={s.select}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={s.label}>Perfil</label>
                <select
                  value={form.profile_id ?? ''}
                  onChange={(e) => field('profile_id', e.target.value ? Number(e.target.value) : null)}
                  className={s.select}
                >
                  <option value="">Nenhum</option>
                  {(profiles.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={s.label}>URL do vídeo (opcional)</label>
                <input
                  value={form.original_video_url ?? ''}
                  onChange={(e) => field('original_video_url', e.target.value)}
                  className={s.input}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
            </div>
            <div className={s.modalFooter}>
              <button onClick={closeModal} className={s.btnSecondary}>Cancelar</button>
              <button onClick={() => create.mutate()} disabled={create.isPending || !form.title} className={s.btnPrimary}>
                {create.isPending ? 'Criando...' : 'Criar campanha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
