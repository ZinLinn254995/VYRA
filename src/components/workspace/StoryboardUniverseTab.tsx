import React from 'react';
import { MyMediaLibraryPage } from '../profile/MyMediaLibraryPage';

type Props = {
  storyboardId: string;
  storyboardTitle: string;
  isActive: boolean;
  renderLibrary?: boolean;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  /** Kept for compatibility with older Workspace callers; generic Storage has no Universe record. */
  onUniverseReady?: (universe: { id: string; name: string; description: string } | null) => void;
};

export const StoryboardUniverseTab: React.FC<Props> = ({
  storyboardId, isActive, renderLibrary = true, isAuthenticated, onLoginRequired,
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
          key={storyboardId}
          isActive={isActive}
          projectId={storyboardId}
        />
      </div>
    </div>
  );
};
