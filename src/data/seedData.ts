/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project, JobQueueItem, MediaAsset, WorkspaceStats } from '../types';
import heroCyberCity from '../assets/images/hero_cyber_city_1792925206979.jpg';
import sceneQuantumChip from '../assets/images/scene_quantum_chip_1792925206672.jpg';
import sceneAvatarPresenter from '../assets/images/scene_avatar_presenter_1792925207281.jpg';
import sceneEcoHabitat from '../assets/images/scene_eco_habitat_1792925207788.jpg';

const LEGACY_SEED_ASSET_URLS: Record<string, string> = {
  '/src/assets/images/hero_cyber_city_1792925206979.jpg': heroCyberCity,
  '/src/assets/images/scene_quantum_chip_1792925206672.jpg': sceneQuantumChip,
  '/src/assets/images/scene_avatar_presenter_1792925207281.jpg': sceneAvatarPresenter,
  '/src/assets/images/scene_eco_habitat_1792925207788.jpg': sceneEcoHabitat,
};

/** Migrate asset URLs saved before Vite production asset URLs were used. */
export function normalizeLegacySeedAssetPath(path: string | undefined): string | undefined {
  return path ? (LEGACY_SEED_ASSET_URLS[path] || path) : path;
}


export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-01-quantum',
    title: 'The Quantum Frontier: Light-Speed Photonic Processing',
    topic: 'How optical photonic computing is replacing traditional silicon microchips to power next-gen neural models',
    category: 'Tech & AI',
    format: 'short_form',
    aspectRatio: '9:16',
    visualStyle: 'cyber_minimal',
    narrationStyle: 'energetic_tech',
    subtitleStyle: 'dynamic_pop',
    targetDuration: 45,
    targetPlatforms: ['YouTube Shorts', 'TikTok', 'Instagram Reels'],
    status: 'in_review',
    createdAt: '2026-10-23T14:22:00Z',
    updatedAt: '2026-10-25T01:15:00Z',
    coverImage: sceneQuantumChip,
    reviewNotes: 'Audio mix is well-balanced. Needs approval on the 0:28 second text disclaimer before publishing.',
    publishingCaption: 'Traditional silicon just hit the physics wall. Photonic processors use guided laser channels for 100x efficiency. Is Moore\'s Law back? ⚡ #QuantumComputing #TechTrends #FutureTech #Semiconductor',
    selectedPlatformsForPublishing: ['youtube', 'tiktok', 'instagram'],
    scenes: [
      {
        id: 'sc-01',
        order: 1,
        narration: 'Traditional silicon chips have hit a thermal wall. But photons move at the absolute speed of light with zero heat.',
        visualPrompt: 'Photorealistic macro view of a next-generation optical quantum computing processor with glowing micro-photonic circuits, deep midnight blue and violet studio laboratory lighting',
        cameraMovement: 'Slow inward macro push with shallow depth of field',
        duration: 9,
        mediaUrl: sceneQuantumChip,
        status: 'ready',
      },
      {
        id: 'sc-02',
        order: 2,
        narration: 'Engineers can now route 100 terabits per second inside a single microscopic synthetic diamond substrate.',
        visualPrompt: 'Studio portrait of a futuristic holographic female tech presenter demonstrating photonic circuits on a glass slate',
        cameraMovement: 'Smooth arc pan from left to center',
        duration: 11,
        mediaUrl: sceneAvatarPresenter,
        status: 'ready',
      },
      {
        id: 'sc-03',
        order: 3,
        narration: 'This breakthrough enables training trillion-parameter neural models directly on municipal grids without melting datacenters.',
        visualPrompt: 'Cinematic wide-angle futuristic smart metropolis at dusk with neon sky-rail and holographic architectural nodes',
        cameraMovement: 'Cinematic crane descent down the neon sky-bridge',
        duration: 12,
        mediaUrl: heroCyberCity,
        status: 'ready',
      },
      {
        id: 'sc-04',
        order: 4,
        narration: 'The era of silicon is giving way to pure light. Follow VYRA for the latest frontiers in synthetic intelligence.',
        visualPrompt: 'Cinematic establishing shot of an advanced sustainable biodome urban sanctuary with aeroponic vertical gardens and clean solar glass towers',
        cameraMovement: 'Dynamic ascending tilt into the golden sunset horizon',
        duration: 13,
        mediaUrl: sceneEcoHabitat,
        status: 'ready',
      },
    ],
  },
  {
    id: 'proj-02-tokyo',
    title: 'Sky-Rail 2088: Autonomous Transit in Neon Metropolises',
    topic: 'Exploration of magnetic elevation railways and decentralized urban commute in 2088',
    category: 'Science & Future',
    format: 'long_form',
    aspectRatio: '16:9',
    visualStyle: 'hyper_realistic',
    narrationStyle: 'authoritative',
    subtitleStyle: 'minimal_lower',
    targetDuration: 60,
    targetPlatforms: ['YouTube & Shorts', 'LinkedIn Video', 'X (Twitter)'],
    status: 'draft',
    createdAt: '2026-10-24T09:30:00Z',
    updatedAt: '2026-10-25T02:40:00Z',
    coverImage: heroCyberCity,
    publishingCaption: 'Autonomous sky-rails are reshaping modern transit hubs. Here is how frictionless maglev networks achieve zero-congestion in vertical cities.',
    selectedPlatformsForPublishing: ['youtube', 'linkedin'],
    scenes: [
      {
        id: 'sc-tokyo-1',
        order: 1,
        narration: 'By 2088, horizontal roads became obsolete in high-density urban corridors. Transit moved upward.',
        visualPrompt: 'Cinematic wide-angle futuristic smart metropolis at dusk with neon sky-rail and holographic architectural nodes',
        cameraMovement: 'High-altitude drone tracking shot along the magnetic rail line',
        duration: 15,
        mediaUrl: heroCyberCity,
        status: 'ready',
      },
      {
        id: 'sc-tokyo-2',
        order: 2,
        narration: 'Magnetic levitation carriages operate at microsecond intervals with AI collision-prevention protocols.',
        visualPrompt: 'Detailed close-up of high-speed maglev transit car sliding silently into an illuminated glass sky-deck station',
        cameraMovement: 'Side tracking dolly matching carriage velocity',
        duration: 20,
        mediaUrl: heroCyberCity,
        status: 'scripted',
      },
      {
        id: 'sc-tokyo-3',
        order: 3,
        narration: 'Urban planners eliminated 94% of ground friction, reclaiming pedestrian boulevards for urban parks.',
        visualPrompt: 'Cinematic establishing shot of an advanced sustainable biodome urban sanctuary with aeroponic vertical gardens and clean solar glass towers',
        cameraMovement: 'Slow vertical pedestal down from sky-rail into lush street-level canopies',
        duration: 25,
        mediaUrl: sceneEcoHabitat,
        status: 'ready',
      },
    ],
  },
  {
    id: 'proj-03-aura',
    title: 'AuraOS: Zero-Latency Synthetic Avatars for Founders',
    topic: 'Product walkthrough of instant multilingual holographic avatars for executive communication',
    category: 'Product Showcase',
    format: 'short_form',
    aspectRatio: '1:1',
    visualStyle: 'cinematic_3d',
    narrationStyle: 'conversational',
    subtitleStyle: 'karaoke_neon',
    targetDuration: 30,
    targetPlatforms: ['LinkedIn Video', 'Instagram Reels', 'X (Twitter)'],
    status: 'approved',
    createdAt: '2026-10-22T11:15:00Z',
    updatedAt: '2026-10-24T18:00:00Z',
    coverImage: sceneAvatarPresenter,
    reviewNotes: 'Approved by Content Lead on Oct 24. Ready for queue dispatch when OAuth credentials are authenticated.',
    publishingCaption: 'Scale your executive presence across 42 languages without recording studio burnout. Introducing AuraOS synthetic avatar integration.',
    selectedPlatformsForPublishing: ['linkedin', 'instagram', 'x'],
    scenes: [
      {
        id: 'sc-aura-1',
        order: 1,
        narration: 'Founders spend hundreds of hours recording product updates. What if your digital double handled the broadcast?',
        visualPrompt: 'Studio portrait of a professional futuristic female tech founder and virtual broadcast presenter in an obsidian studio',
        cameraMovement: 'Direct eye-level push in with soft rim lighting',
        duration: 14,
        mediaUrl: sceneAvatarPresenter,
        status: 'ready',
      },
      {
        id: 'sc-aura-2',
        order: 2,
        narration: 'With millisecond facial synchronization and natural voice cadences, your message connects across every global timezone.',
        visualPrompt: 'Macro view of optical quantum computing processor with glowing micro-photonic circuits simulating neural compute',
        cameraMovement: 'Dynamic orbital rotation around the processor',
        duration: 16,
        mediaUrl: sceneQuantumChip,
        status: 'ready',
      },
    ],
  },
  {
    id: 'proj-04-biophilic',
    title: 'Biophilic Habitats: Architecture Meets Aeroponics',
    topic: 'Documentary exploration of sustainable glass dome cities producing their own food and microclimate',
    category: 'Documentary',
    format: 'long_form',
    aspectRatio: '16:9',
    visualStyle: 'documentary_grain',
    narrationStyle: 'empathetic_storyteller',
    subtitleStyle: 'minimal_lower',
    targetDuration: 90,
    targetPlatforms: ['YouTube & Shorts'],
    status: 'archived',
    createdAt: '2026-10-15T08:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    coverImage: sceneEcoHabitat,
    publishingCaption: 'Archived project from Season 1 biophilic design series.',
    selectedPlatformsForPublishing: ['youtube'],
    scenes: [
      {
        id: 'sc-bio-1',
        order: 1,
        narration: 'Inside the Alpine Biosphere Dome, ten thousand inhabitants thrive without consuming municipal grid water.',
        visualPrompt: 'Cinematic establishing shot of an advanced sustainable biodome urban sanctuary with aeroponic vertical gardens and clean solar glass towers',
        cameraMovement: 'Wide sweeping landscape tilt across the lake and dome structures',
        duration: 30,
        mediaUrl: sceneEcoHabitat,
        status: 'ready',
      },
    ],
  },
];

export const INITIAL_JOBS: JobQueueItem[] = [
  {
    id: 'job-982',
    projectId: 'proj-01-quantum',
    projectTitle: 'The Quantum Frontier',
    jobType: 'scene_synthesis',
    progress: 74,
    status: 'processing',
    estimatedSecondsLeft: 14,
    startedAt: '2026-10-25T03:42:00Z',
  },
  {
    id: 'job-981',
    projectId: 'proj-02-tokyo',
    projectTitle: 'Sky-Rail 2088',
    jobType: 'voice_synthesis',
    progress: 100,
    status: 'completed',
    estimatedSecondsLeft: 0,
    startedAt: '2026-10-25T03:30:00Z',
  },
  {
    id: 'job-980',
    projectId: 'proj-03-aura',
    projectTitle: 'AuraOS Synthetic Avatars',
    jobType: 'composite_export',
    progress: 100,
    status: 'completed',
    estimatedSecondsLeft: 0,
    startedAt: '2026-10-25T03:15:00Z',
  },
];

export const INITIAL_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'media-01',
    title: 'Tokyo 2088 Sky-Rail Establishing Shot',
    type: 'image',
    url: heroCyberCity,
    dimensions: '1920x1080',
    tags: ['Cyberpunk', 'Cityscape', 'Sky-rail', 'Night'],
    createdAt: '2026-10-25T03:46:00Z',
  },
  {
    id: 'media-02',
    title: 'Photonic Optical Processor Macro',
    type: 'image',
    url: sceneQuantumChip,
    dimensions: '1920x1080',
    tags: ['Quantum', 'Hardware', 'Photonic', 'Cyan'],
    createdAt: '2026-10-25T03:46:00Z',
  },
  {
    id: 'media-03',
    title: 'Aura Presenter Holographic Anchor',
    type: 'image',
    url: sceneAvatarPresenter,
    dimensions: '1024x1024',
    tags: ['Avatar', 'Host', 'Studio', 'Futuristic'],
    createdAt: '2026-10-25T03:46:00Z',
  },
  {
    id: 'media-04',
    title: 'Biosphere Dome Vertical Agriculture',
    type: 'image',
    url: sceneEcoHabitat,
    dimensions: '1920x1080',
    tags: ['Ecology', 'Biodome', 'Architecture', 'Green'],
    createdAt: '2026-10-25T03:46:00Z',
  },
];

export const INITIAL_STATS: WorkspaceStats = {
  totalProjects: 4,
  activeDrafts: 1,
  awaitingReview: 1,
  approvedCount: 1,
  totalScenesRendered: 9,
  generationSecondsUsed: 225,
  monthlyQuotaSeconds: 1800,
};

export const INITIAL_CONVERSATIONS = [
  {
    id: 'conv-01-quantum',
    title: 'Photonic Computing & Chip Revolution',
    category: 'Tech & AI',
    isPinned: true,
    createdAt: '2026-10-24T18:30:00Z',
    updatedAt: '2026-10-25T01:20:00Z',
    messages: [
      {
        id: 'msg-01',
        role: 'user' as const,
        content: 'Give me 3 viral opening hooks for a YouTube Short about optical quantum processors replacing silicon chips.',
        timestamp: '2026-10-24T18:30:00Z',
      },
      {
        id: 'msg-02',
        role: 'assistant' as const,
        content: `### High-Retention Hook Proposals for Photonic Computing\n\n` +
          `1. **The Thermal Wall Interrupt (0:00 - 0:04):**\n` +
          `   *"Silicon chips just hit a physical wall. But what if processors didn't use electricity at all?"*\n\n` +
          `2. **The Speed of Light Contrast (0:00 - 0:05):**\n` +
          `   *"This microscopic piece of synthetic diamond routes 100 terabits per second using pure laser beams. Here is how it works."*\n\n` +
          `3. **The Datacenter Crisis Angle (0:00 - 0:05):**\n` +
          `   *"Trillion-parameter AI models are about to melt our power grid—unless this photonic chip replaces silicon first."*\n\n` +
          `*Recommendation:* Hook 2 pairs exceptionally well with a macro push-in camera shot of the micro-photonic circuits.`,
        timestamp: '2026-10-24T18:30:15Z',
        isPreviewNotice: true,
        suggestedActions: [
          {
            label: 'Create Project with Hook 2',
            action: 'create_project' as const,
            data: {
              title: 'Light-Speed Photonic Processors',
              topic: 'How optical photonic computing routes 100 terabits per second using laser beams on synthetic diamond',
              category: 'Tech & AI' as const,
              format: 'short_form' as const,
            },
          },
          {
            label: 'Save Hook to Scratchpad',
            action: 'save_idea' as const,
            data: {
              title: 'Silicon Thermal Wall Hook',
              topic: 'Silicon chips hit physical wall; photonic lasers replace electricity',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'conv-02-tokyo',
    title: 'Tokyo 2088 Transit Systems',
    category: 'Science & Future',
    isPinned: false,
    createdAt: '2026-10-23T12:00:00Z',
    updatedAt: '2026-10-24T16:00:00Z',
    messages: [
      {
        id: 'msg-tokyo-1',
        role: 'user' as const,
        content: 'Turn this topic into a compelling video concept: autonomous magnetic sky-rails eliminating ground traffic in 2088.',
        timestamp: '2026-10-23T12:00:00Z',
      },
      {
        id: 'msg-tokyo-2',
        role: 'assistant' as const,
        content: `### Video Concept: The Vertical Transit Revolution\n\n` +
          `**Working Title:** *Tokyo 2088: Why Roads Disappeared*\n` +
          `**Target Format:** 16:9 Widescreen (or 9:16 vertical 3-part series)\n` +
          `**Core Narrative Arc:**\n` +
          `- **Scene 1 (The Bottleneck):** High-density urban corridors reached gridlock saturation by 2045.\n` +
          `- **Scene 2 (The Maglev Shift):** Magnetic levitation sky-rails suspended between architectural hubs moved 90% of commuters off ground level.\n` +
          `- **Scene 3 (The Green Recovery):** Reclaimed street-level boulevards transformed into lush pedestrian parks and aeroponic corridors.\n\n` +
          `**Visual Style Recommendation:** Cyber-Minimal or Hyper-Realistic 8K with neon twilight atmospheric grading.`,
        timestamp: '2026-10-23T12:00:20Z',
        isPreviewNotice: true,
        suggestedActions: [
          {
            label: 'Open in Video Generator',
            action: 'develop_script' as const,
            data: {
              title: 'Tokyo 2088: Why Roads Disappeared',
              topic: 'Autonomous magnetic sky-rails eliminating ground vehicle traffic and reclaiming pedestrian parks in 2088',
            },
          },
        ],
      },
    ],
  },
  {
    id: 'conv-03-biophilic',
    title: 'Biophilic Smart City Architecture',
    category: 'Documentary',
    isPinned: false,
    createdAt: '2026-10-22T09:15:00Z',
    updatedAt: '2026-10-23T10:45:00Z',
    messages: [
      {
        id: 'msg-bio-1',
        role: 'user' as const,
        content: 'What are the best thumbnail concepts and title variants for a documentary about glass biodomes?',
        timestamp: '2026-10-22T09:15:00Z',
      },
      {
        id: 'msg-bio-2',
        role: 'assistant' as const,
        content: `### Thumbnail & Title Optimization Package\n\n` +
          `**Title Options:**\n` +
          `1. *Inside the Cities That Grow Their Own Oxygen*\n` +
          `2. *The 2050 Biodome: Surviving Outside the Grid*\n` +
          `3. *How Architecture Solved the Climate Crisis*\n\n` +
          `**Thumbnail Visual Directions:**\n` +
          `- **Option A (High Drama):** Split composition showing desert wasteland on the left transitioning into a lush, radiant glass biodome on the right.\n` +
          `- **Option B (Scale & Wonder):** Low-angle wide panoramic shot of towering hexagonal solar towers with lush vertical gardens inside crystal-clear geodesic canopies.`,
        timestamp: '2026-10-22T09:15:30Z',
        isPreviewNotice: true,
        suggestedActions: [
          {
            label: 'Save Title Ideas',
            action: 'save_idea' as const,
            data: {
              title: 'Biodome Documentary Titles',
              topic: 'Inside the Cities That Grow Their Own Oxygen',
            },
          },
        ],
      },
    ],
  },
];

export const INITIAL_SAVED_IDEAS = [
  {
    id: 'idea-01',
    title: 'Light-Speed Optical Processors',
    concept: 'Photonic lasers routing data at light-speed through synthetic diamond substrates to power next-gen neural models.',
    category: 'Tech & AI' as const,
    tags: ['Quantum', 'Hardware', 'Hardware Architecture', 'Shorts'],
    createdAt: '2026-10-24T18:31:00Z',
  },
  {
    id: 'idea-02',
    title: 'Tokyo 2088 Vertical Commute',
    concept: 'Decentralized magnetic elevation carriages suspended between residential sky-nodes with zero ground friction.',
    category: 'Science & Future' as const,
    tags: ['Maglev', 'Sky-rail', 'Urbanism', 'Doc'],
    createdAt: '2026-10-23T12:01:00Z',
  },
  {
    id: 'idea-03',
    title: 'Oxygen-Positive Biodome Habitats',
    concept: 'Geodesic closed-loop urban sanctuaries producing aeroponic crops and micro-climate filtration.',
    category: 'Documentary' as const,
    tags: ['Sustainability', 'Biodome', 'Architecture'],
    createdAt: '2026-10-22T09:16:00Z',
  },
];

