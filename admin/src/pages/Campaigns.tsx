import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listVideos, createVideo, deleteVideo, listProfiles, type VideoPayload } from '../lib/api';
import { s } from '../lib/styles';

const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'x', 'outro'];

const PLATFORM_COLORS: Record<string, string> = {
  youtube:   'bg-red-500/10 text-red-400 border-red-500/20',
  instagram: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  tiktok:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
  facebook:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  x:         'bg-gray-500/10 text-gray-400 border-gray-500/20',
  outro:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const EMPTY: VideoPayload = { title: '', platform: 'youtube', original_video_url: '', profile_id: null };

function IcSort({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-gray-300 dark:text-gh-muted/40 ml-1">↕</span>;
  return <span className="ml-1">{dir === 'desc' ? '↓' : '↑'}</span>;
}

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
      const val = (v: any) => sortKey === 'broken' ? (v.broken_links_count ?? 0) : (v.total_clicks ?? 0);
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar campanhas..."
          className="w-72 border border-gray-300 dark:border-white/[0.12] bg-white dark:bg-gh-over text-gray-900 dark:text-gh-text placeholder-gray-400 dark:placeholder-gh-muted rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
        />
        <select
          value={profileFilter}
          onChange={(e) => setProfileFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="border border-gray-300 dark:border-white/[0.12] bg-white dark:bg-gh-over text-gray-900 dark:text-gh-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 transition-colors"
        >
          <option value="">Todos os perfis</option>
          {(profiles.data ?? []).map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {(search || profileFilter !== '') && (
          <button onClick={() => { setSearch(''); setProfileFilter(''); }} className={`text-sm ${s.textMuted} hover:text-gray-700 dark:hover:text-gh-text`}>
            Limpar filtros
          </button>
        )}
      </div>

      <div className={s.tableWrap}>
        <table className="w-full">
          <thead className={s.thead}>
            <tr>
              <th className={s.th}>Campanha</th>
              <th className={s.th}>Canal</th>
              <th className={s.th}>Plataforma</th>
              <th
                className={`${s.th} cursor-pointer select-none hover:text-gray-700 dark:hover:text-gh-text`}
                onClick={() => toggleSort('clicks')}
              >
                Cliques <IcSort active={sortKey === 'clicks'} dir={sortDir} />
              </th>
              <th
                className={`${s.th} cursor-pointer select-none hover:text-gray-700 dark:hover:text-gh-text`}
                onClick={() => toggleSort('broken')}
              >
                Links Quebrados <IcSort active={sortKey === 'broken'} dir={sortDir} />
              </th>
              <th className={s.th} />
            </tr>
          </thead>
          <tbody className={s.tdDiv}>
            {filtered.map((v: any) => {
              const profile = profileMap.get(v.profile_id) as any;
              const brokenCount = v.broken_links_count ?? 0;
              const reviewCount = v.human_review_count ?? 0;
              const allOk = brokenCount === 0 && reviewCount === 0;

              return (
                <tr key={v.id} className={s.tr}>
                  {/* Title */}
                  <td className="px-6 py-4 max-w-[280px]">
                    <Link
                      to={`/admin/campaigns/${v.id}`}
                      className="font-semibold text-gray-900 dark:text-gh-text hover:text-brand-500 dark:hover:text-brand-400 transition-colors text-sm truncate block"
                    >
                      {v.title}
                    </Link>
                    {v.original_video_url && (
                      <a
                        href={v.original_video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 dark:text-gh-muted hover:text-brand-500 mt-0.5 truncate block max-w-[260px]"
                      >
                        {v.original_video_url}
                      </a>
                    )}
                  </td>

                  {/* Canal */}
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gh-muted">
                    {profile ? profile.name : '—'}
                  </td>

                  {/* Platform */}
                  <td className="px-6 py-4">
                    {v.platform && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PLATFORM_COLORS[v.platform?.toLowerCase()] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        {v.platform}
                      </span>
                    )}
                  </td>

                  {/* Clicks */}
                  <td className="px-6 py-4 text-sm font-semibold text-gray-800 dark:text-gh-text">
                    {(v.total_clicks ?? 0).toLocaleString('pt-BR')}
                  </td>

                  {/* Broken links */}
                  <td className="px-6 py-4">
                    {allOk ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Tudo ok
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {brokenCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                            {brokenCount} quebrado{brokenCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {reviewCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                            {reviewCount} revisão
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        to={`/admin/campaigns/${v.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-brand-500 border border-brand-500/30 rounded-lg hover:bg-brand-500/10 transition-colors"
                      >
                        Ver links
                      </Link>
                      <button
                        onClick={() => { if (confirm('Excluir esta campanha?')) remove.mutate(v.id); }}
                        className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors"
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
                <td colSpan={6} className={`px-6 py-12 text-center ${s.textMuted} text-sm`}>
                  {search || profileFilter !== '' ? 'Nenhuma campanha encontrada.' : 'Nenhuma campanha cadastrada ainda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
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
                <input value={form.title} onChange={(e) => field('title', e.target.value)} className={s.input} placeholder="Ex: Review do produto X" />
              </div>
              <div>
                <label className={s.label}>Plataforma do conteúdo</label>
                <select value={form.platform ?? ''} onChange={(e) => field('platform', e.target.value)} className={s.select}>
                  {PLATFORMS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={s.label}>Canal (perfil)</label>
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
                <input value={form.original_video_url ?? ''} onChange={(e) => field('original_video_url', e.target.value)} className={s.input} placeholder="https://youtube.com/watch?v=..." />
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
