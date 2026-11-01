import React, { useMemo, useState } from 'react';
import { CloudDownload, RefreshCw, ShieldCheck, AlertTriangle, Laptop, FolderPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStudio } from '../../context/StudioContext';
import type { Project } from '../../types';
import { restoreCloudProject, type CloudProjectRow } from '../../services/cloudProjectRestore';

async function readApiError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || 'Cloud storage request failed. Please try again.';
}

export const CloudProjectRestorePanel: React.FC = () => {
  const { user, session, serverVerified } = useAuth();
  const { projects, restoreCloudProjects } = useStudio();
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRow[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const accessToken = session?.access_token;

  const validProjects = useMemo(
    () => (cloudProjects ?? []).map(restoreCloudProject).filter((project): project is Project => project !== null),
    [cloudProjects],
  );
  const existingIds = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);
  const restorableProjects = useMemo(
    () => validProjects.filter((project) => !existingIds.has(project.id)),
    [validProjects, existingIds],
  );

  const loadCloudProjects = async () => {
    if (!accessToken || !serverVerified) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/projects', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = await response.json() as { projects?: CloudProjectRow[] };
      setCloudProjects(Array.isArray(payload.projects) ? payload.projects : []);
      setPreviewOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load cloud projects.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => {
    const restoredCount = restoreCloudProjects(restorableProjects);
    setMessage(restoredCount > 0
      ? `Restored ${restoredCount} project(s). Your existing local projects were kept unchanged.`
      : 'Nothing new to restore. Matching local project IDs were skipped.');
    setPreviewOpen(false);
  };

  return (
    <section aria-labelledby="cloud-project-restore-title" className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-[#8D7CFF]/10 flex items-center justify-center text-[#A99DFF] light:text-indigo-600">
            <Laptop className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="cloud-project-restore-title" className="text-sm font-bold text-white light:text-slate-900">Restore from Cloud</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400 light:text-slate-600">
              Bring backed-up project details and storyboard text onto this device.
            </p>
          </div>
        </div>
        <span className={serverVerified ? 'text-[11px] text-emerald-400 light:text-emerald-600' : 'text-[11px] text-amber-400 light:text-amber-700'}>
          {serverVerified ? '● Account verified' : '● Sign in and verify account'}
        </span>
      </div>

      {!user ? (
        <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 light:text-amber-800">
          Sign in from the Account button in the top bar to access your cloud projects.
        </p>
      ) : !serverVerified ? (
        <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 light:text-amber-800">
          Cloud restore is disabled until your account session is verified by the VYRA server.
        </p>
      ) : (
        <>
          <button type="button" disabled={busy} onClick={loadCloudProjects} className="inline-flex items-center gap-2 rounded-lg border border-[#3B416B] light:border-slate-300 px-3 py-2 text-xs font-semibold text-slate-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-50 disabled:opacity-50">
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            Find cloud backups
          </button>

          {previewOpen && (
            <div className="rounded-lg border border-[#8D7CFF]/30 bg-[#090B18]/60 light:bg-indigo-50 p-3 sm:p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-[#A99DFF] light:text-indigo-700 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white light:text-slate-900">Restore preview · {restorableProjects.length} new project(s)</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400 light:text-slate-600">
                    Existing local projects with matching IDs will be skipped, never overwritten. Generated media files are not part of this backup and will need to be generated again or added on this device.
                  </p>
                </div>
              </div>
              {validProjects.length ? (
                <ul className="max-h-44 overflow-y-auto space-y-2">
                  {validProjects.map((project) => (
                    <li key={project.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-slate-200 light:text-slate-800">{project.title}</span>
                      <span className={existingIds.has(project.id) ? 'shrink-0 text-amber-400' : 'shrink-0 text-emerald-400'}>
                        {existingIds.has(project.id) ? 'Already on device' : `${project.scenes.length} scenes`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">No restorable project backups found.</p>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#2B3058] light:border-indigo-200 pt-3">
                <p className="text-[11px] text-slate-400 light:text-slate-600">No local project will be replaced.</p>
                <button type="button" disabled={restorableProjects.length === 0} onClick={confirmRestore} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#8D7CFF] px-3 py-2 text-xs font-bold text-[#090B18] hover:bg-[#A99DFF] disabled:opacity-50">
                  <FolderPlus className="w-4 h-4" />
                  Restore new projects
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {message && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300 light:text-emerald-700">{message}</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300 light:text-rose-700"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
    </section>
  );
};
