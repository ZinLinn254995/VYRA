/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Centralized Brand Configuration
 *
 * NOTE: "VYRA" is a provisional project name pending trademark and domain clearance.
 * Keep this configuration isolated so brand assets, names, taglines, and social
 * channels can be swapped across the entire application in seconds without code rewrites.
 */

export interface BrandConfig {
  id: string;
  name: string;
  tagline: string;
  shortDescription: string;
  version: string;
  statusNotice: string;
  colors: {
    dark: {
      bgMidnight: string;
      surfaceDeepSpace: string;
      accentCyan: string;
      accentViolet: string;
      accentMagenta: string;
    };
    light: {
      bgBase: string;
      surfaceWhite: string;
      accentCyan: string;
      accentViolet: string;
      accentMagenta: string;
    };
  };
  navigationSections: {
    id: string;
    label: string;
    icon: string;
    description: string;
  }[];
  socialChannels: {
    id: string;
    name: string;
    status: 'connected' | 'not_connected';
    formats: string[];
    description: string;
  }[];
}

export const BRAND_CONFIG: BrandConfig = {
  id: 'vyra-studio',
  name: 'VYRA',
  tagline: 'Create beyond imagination.',
  shortDescription: 'Futuristic AI Video Creation Studio & Social Publishing Platform',
  version: '0.1.0-WP1 (Foundation)',
  statusNotice: 'Provisional project brand pending trademark clearance',
  colors: {
    dark: {
      bgMidnight: '#090B18',
      surfaceDeepSpace: '#171A35',
      accentCyan: '#55F4FF',
      accentViolet: '#8D7CFF',
      accentMagenta: '#E36CFF',
    },
    light: {
      bgBase: '#F8FAFC',
      surfaceWhite: '#FFFFFF',
      accentCyan: '#0284C7',
      accentViolet: '#6366F1',
      accentMagenta: '#C026D3',
    },
  },
  navigationSections: [
    { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', description: 'Studio overview, active jobs & recent drafts' },
    { id: 'projects', label: 'Projects', icon: 'FolderKanban', description: 'All video projects, active work, and archives' },
    { id: 'create', label: 'Create Video', icon: 'Sparkles', description: 'Guided AI video generation & storyboard wizard' },
    { id: 'ideas', label: 'AI Ideas Chat', icon: 'Bot', description: 'Brainstorm, outline, and refine video concepts with AI' },
    { id: 'workspace', label: 'Storyboard Workspace', icon: 'Film', description: 'Scene sequencer, narration scripts, and prompts' },
    { id: 'media', label: 'Media Library', icon: 'Image', description: 'Generated B-roll, voice tracks, and brand kit assets' },
    { id: 'review', label: 'Review Queue', icon: 'CheckSquare', description: 'Preview, caption editing, and approval workflow' },
    { id: 'publishing', label: 'Publishing', icon: 'Share2', description: 'Channel accounts, distribution queues, and schedules' },
    { id: 'analytics', label: 'Analytics', icon: 'BarChart3', description: 'Workspace production stats and performance metrics' },
    { id: 'settings', label: 'Settings', icon: 'Settings', description: 'Brand kit, service integrations, and preferences' },
  ],
  socialChannels: [
    {
      id: 'youtube',
      name: 'YouTube & Shorts',
      status: 'not_connected',
      formats: ['16:9 Landscape', '9:16 Shorts'],
      description: 'Requires Google Workspace / YouTube Data API v3 OAuth integration.',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      status: 'not_connected',
      formats: ['9:16 Vertical'],
      description: 'Requires TikTok Content Posting API authorization.',
    },
    {
      id: 'instagram',
      name: 'Instagram Reels',
      status: 'not_connected',
      formats: ['9:16 Reels', '1:1 Square Feed'],
      description: 'Requires Meta Graph API Instagram Content Publishing token.',
    },
    {
      id: 'linkedin',
      name: 'LinkedIn Video',
      status: 'not_connected',
      formats: ['16:9 Landscape', '1:1 Square'],
      description: 'Requires LinkedIn Community Management API access.',
    },
    {
      id: 'x',
      name: 'X (Twitter)',
      status: 'not_connected',
      formats: ['16:9 Landscape', '9:16 Vertical', '1:1 Square'],
      description: 'Requires X API v2 Media Upload & Tweet creation scopes.',
    },
  ],
};
