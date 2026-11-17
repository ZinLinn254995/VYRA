import React from 'react';
import { ProjectStoragePage } from './ProjectStoragePage';

type Props = {
  projectId: string;
  isActive: boolean;
  renderLibrary?: boolean;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
};

export const ProjectStorageTab: React.FC<Props> = ({
  projectId, isActive, renderLibrary = true, isAuthenticated, onLoginRequired,
}) => {
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-sm font-semibold text-[var(--vyra-text-primary)]">Sign in to use this Project’s Storage</p>
        <button type="button" onClick={onLoginRequired} className="rounded-lg bg-[var(--vyra-accent-primary)] px-4 py-2 text-xs font-semibold text-slate-950">Sign in</button>
      </div>
    );
  }

  if (!renderLibrary) return null;

  return (
    <div className="h-full min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
      <div className="mx-auto w-full max-w-6xl">
        <MyMediaLibraryPage
          key={projectId}
          isActive={isActive}
          projectId={projectId}
        />
      </div>
    </div>
  );
};
