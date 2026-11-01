import React, { useMemo, useState } from 'react';
import { Cloud, CloudDownload, CloudUpload, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useStudio } from '../../context/StudioContext';
import type { Project } from '../../types';

type CloudProjectRow = {
  id: string;
  local_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function toPortableProject(project: Project) {
  return {
    localId: project.id,
    title: project.title,
    status: project.status,
    projectData: {
      topic: project.topic,
      category: project.category,
      format: project.format,
      aspectRatio: project.aspectRatio,
      visualStyle: project.visualStyle,
      narrationStyle: project.narrationStyle,
      subtitleStyle: project.subtitleStyle,
      videoType: project.videoType,
      creativeDirection: project.creativeDirection,
      visualStyleDescription: project.visualStyleDescription,
      audioDirection: project.audioDirection,
      audience: project.audience,
      language: project.language,
      targetDuration: project.targetDuration,
      targetPlatforms: project.targetPlatforms,
      productionStage: project.productionStage,
      productionStageUpdatedAt: project.productionStageUpdatedAt,
      productionStageNotes: project.productionStageNotes,
      reviewNotes: project.reviewNotes,
      publishingCaption: project.publishingCaption,
      selectedPlatformsForPublishing: project.selectedPlatformsForPublishing,
      scenes: project.scenes.map((scene) => ({
        id: scene.id,
        order: scene.order,
        narration: scene.narration,
        visualPrompt: scene.visualPrompt,
        cameraMovement: scene.cameraMovement,
        duration: scene.duration,
        shotType: scene.shotType,
        dialogue: scene.dialogue,
        onScreenText: scene.onScreenText,
        soundDesign: scene.soundDesign,
        transition: scene.transition,
        status: scene.status,
      })),
    },
  };
}

async function readApiError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({})) as { error?: string };
  return payload.error || 'Cloud storage request failed. Please try again.';
}

export const CloudProjectBackupPanel: React.FC = () => {
  const { user, session, serverVerified } = useAuth();
  const { projects } = useStudio();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRow[] | null>(null);
  const [showCloudList, setShowCloudList] = useState(false);

  const portableProjects = useMemo(() => projects.map(toPortableProject), [projects]);
  const accessToken = session?.access_token;

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
      setShowCloudList(true);
      setMessage('Cloud project list refreshed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load cloud projects.');
    } finally {
      setBusy(false);
    }
  };

  const confirmBackup = async () => {
    if (!accessToken || !serverVerified || portableProjects.length === 0) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/projects/import', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projects: portableProjects }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const payload = await response.json() as { imported?: number };
      setMessage(`Cloud backup complete. ${payload.imported ?? portableProjects.length} project(s) saved.`);
      setPreviewOpen(false);
      setCloudProjects(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cloud backup failed. Your local projects are unchanged.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="cloud-project-backup-title" className="rounded-xl border border-[#2B3058] light:border-slate-200 bg-[#171A35] light:bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-lg bg-[#55F4FF]/10 flex items-center justify-center text-[#55F4FF] light:text-sky-600">
            <Cloud className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 id="cloud-project-backup-title" className="text-sm font-bold text-white light:text-slate-900">Cloud Project Backup</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400 light:text-slate-600">
              Save project details and storyboards to your account so they are not limited to this browser.
            </p>
          </div>
        </div>
        <span className={serverVerified ? 'text-[11px] text-emerald-400 light:text-emerald-600' : 'text-[11px] text-amber-400 light:text-amber-700'}>
          {serverVerified ? '● Account verified' : '● Sign in and verify account'}
        </span>
      </div>

      {!user ? (
        <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 light:text-amber-800">
          Sign in from the Account button in the top bar to enable cloud backup. Your current projects remain saved locally.
        </p>
      ) : !serverVerified ? (
        <p className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200 light:text-amber-800">
          Your account session has not been verified by the VYRA server yet. Cloud backup is disabled until verification succeeds.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => { setError(''); setMessage(''); setPreviewOpen((value) => !value); }} className="inline-flex items-center gap-2 rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] hover:bg-[#55F4FF]/90 disabled:opacity-50">
              <CloudUpload className="w-4 h-4" />
              {previewOpen ? 'Hide backup preview' : 'Review local backup'}
            </button>
            <button type="button" disabled={busy} onClick={loadCloudProjects} className="inline-flex items-center gap-2 rounded-lg border border-[#3B416B] light:border-slate-300 px-3 py-2 text-xs font-semibold text-slate-200 light:text-slate-700 hover:bg-white/5 light:hover:bg-slate-50 disabled:opacity-50">
              {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              View cloud projects
            </button>
          </div>

          {previewOpen && (
            <div className="rounded-lg border border-[#55F4FF]/30 bg-[#090B18]/60 light:bg-sky-50 p-3 sm:p-4 space-y-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-[#55F4FF] light:text-sky-700 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white light:text-slate-900">Backup preview · {portableProjects.length} project(s)</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400 light:text-slate-600">
                    Only project settings, scripts, storyboard text and production notes will be uploaded. Generated media files, device-only media IDs and local media URLs are not included.
                  </p>
                </div>
              </div>
              <ul className="max-h-40 overflow-y-auto space-y-1.5">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-200 light:text-slate-800">{project.title}</span>
                    <span className="shrink-0 text-slate-500">{project.scenes.length} scenes</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[#2B3058] light:border-sky-200 pt-3">
                <p className="text-[11px] text-slate-400 light:text-slate-600">Your local projects will not be deleted or replaced.</p>
                <button type="button" disabled={busy || portableProjects.length === 0} onClick={confirmBackup} className="rounded-lg bg-[#55F4FF] px-3 py-2 text-xs font-bold text-[#090B18] hover:bg-[#55F4FF]/90 disabled:opacity-50">
                  {busy ? 'Saving…' : 'Confirm and back up'}
                </button>
              </div>
            </div>
          )}

          {showCloudList && cloudProjects && (
            <div className="rounded-lg border border-[#2B3058] light:border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-white light:text-slate-900">Cloud projects ({cloudProjects.length})</p>
                <button type="button" onClick={() => setShowCloudList(false)} className="text-[11px] text-slate-400 hover:text-white light:hover:text-slate-900">Hide</button>
              </div>
              {cloudProjects.length ? (
                <ul className="max-h-40 overflow-y-auto space-y-2">
                  {cloudProjects.map((project) => (
                    <li key={project.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-slate-200 light:text-slate-800">{project.title}</span>
                      <span className="shrink-0 text-slate-500">{project.status.replace('_', ' ')}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-slate-500">No cloud projects saved yet.</p>}
            </div>
          )}
        </>
      )}

      {message && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-300 light:text-emerald-700">{message}</p>}
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300 light:text-rose-700"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</p>}
    </section>
  );
};
