import type {
  ConsistencyAssetKind,
  ConsistencyReference,
  ConsistencyRule,
  Project,
  Scene,
} from '../types';

export interface SceneConsistencyContext {
  references: ConsistencyReference[];
  rules: ConsistencyRule[];
  instructions: string[];
}

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

/**
 * Resolve the references and rules that apply to one scene.
 * Legacy CharacterReference records are adapted in-memory so existing projects
 * keep working without a migration or destructive rewrite.
 */
export function resolveSceneConsistencyContext(
  project: Project,
  scene: Scene,
): SceneConsistencyContext {
  const bible = project.consistencyBible;
  const selectedIds = new Set(scene.consistencyReferenceIds || []);
  const selectedKinds = new Set<ConsistencyAssetKind>();
  const references: ConsistencyReference[] = [];

  for (const reference of bible?.references || []) {
    if (!selectedIds.has(reference.id)) continue;
    references.push(reference);
    selectedKinds.add(reference.kind);
  }

  const assignedCharacterIds = new Set(scene.characterIds || []);
  for (const character of project.characters || []) {
    if (!assignedCharacterIds.has(character.id)) continue;
    selectedKinds.add('character');
    references.push({
      id: character.id,
      kind: 'character',
      name: character.name,
      description: [character.visualDescription, character.continuityNotes].filter(Boolean).join('\n'),
      mediaIds: character.referenceImageId ? [character.referenceImageId] : [],
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
    });
  }

  const deduplicatedReferences = references.filter(
    (reference, index, all) => all.findIndex((item) => item.id === reference.id) === index,
  );
  const rules = (bible?.rules || [])
    .filter((rule) => rule.active)
    .filter((rule) => rule.scope !== 'scene' || (rule.sceneIds || []).includes(scene.id))
    .filter((rule) => !rule.appliesTo?.length || rule.appliesTo.some((kind) => selectedKinds.has(kind)))
    .sort((a, b) => b.priority - a.priority || strengthRank(b) - strengthRank(a));

  const instructions = [
    ...deduplicatedReferences.map((reference) =>
      `[CONSISTENCY REFERENCE: ${reference.kind.toUpperCase()} — ${reference.name}]\n${reference.description}`,
    ),
    ...rules.map((rule) =>
      `[CONSISTENCY RULE: ${rule.strength.toUpperCase()} | priority ${rule.priority}]\n${rule.instruction}`,
    ),
  ];

  return { references: deduplicatedReferences, rules, instructions };
}

function strengthRank(rule: ConsistencyRule): number {
  if (rule.strength === 'locked') return 3;
  if (rule.strength === 'preferred') return 2;
  return 1;
}

/** Format resolved continuity context for a provider prompt without inventing capabilities. */
export function composeSceneConsistencyInstructions(
  project: Project,
  scene: Scene,
): string {
  const context = resolveSceneConsistencyContext(project, scene);
  if (!context.instructions.length) return '';
  return [
    'CONSISTENCY REQUIREMENTS — preserve these details across the requested scene.',
    'Treat LOCKED rules as hard constraints, PREFERRED rules as strong guidance, and FLEXIBLE rules as optional guidance.',
    ...context.instructions,
    'Do not silently alter named identities, brand details, environment layout, visual treatment, or continuity facts.',
  ].join('\n\n');
}


export interface SceneVoiceProfile {
  referenceId: string;
  referenceName: string;
  voiceId?: string;
  speed: number;
}

/**
 * Resolve the selected voice identity for speech generation.
 * Multiple different configured voice IDs are rejected rather than silently
 * choosing one and breaking continuity between scenes.
 */
export function resolveSceneVoiceProfile(project: Project, scene: Scene): SceneVoiceProfile | null {
  const voiceReferences = resolveSceneConsistencyContext(project, scene).references
    .filter((reference) => reference.kind === 'voice' && reference.voiceProfile);
  const configured = voiceReferences.filter((reference) => reference.voiceProfile?.voiceId?.trim());
  const distinctVoiceIds = unique(configured.map((reference) => reference.voiceProfile!.voiceId!.trim()));
  if (distinctVoiceIds.length > 1) {
    throw new Error('This scene has multiple Voice references with different Voice IDs. Keep only one configured Voice ID per scene to preserve a stable voice identity.');
  }
  const selected = configured[0] || voiceReferences[0];
  if (!selected) return null;
  const speed = selected.voiceProfile?.speed;
  return {
    referenceId: selected.id,
    referenceName: selected.name,
    voiceId: selected.voiceProfile?.voiceId?.trim() || undefined,
    speed: typeof speed === 'number' && Number.isFinite(speed) ? Math.max(0.5, Math.min(2, speed)) : 1,
  };
}


/**
 * Build an explicit soundtrack/sound-design brief from selected references.
 * This is prompt guidance only; it does not claim that a video or audio provider
 * will synthesize a separate music or effects track.
 */
export function composeSceneAudioConsistencyInstructions(project: Project, scene: Scene): string {
  const context = resolveSceneConsistencyContext(project, scene);
  const music = context.references.filter((reference) => reference.kind === 'music');
  const sounds = context.references.filter((reference) => reference.kind === 'audio');
  const lines: string[] = [];
  if (project.audioDirection?.trim()) lines.push('PROJECT AUDIO DIRECTION: ' + project.audioDirection.trim());
  for (const reference of music) {
    const profile = reference.musicProfile;
    lines.push('[MUSIC CONTINUITY: ' + reference.name + ']');
    if (reference.description.trim()) lines.push('Identity: ' + reference.description.trim());
    if (profile?.genre) lines.push('Genre: ' + profile.genre);
    if (typeof profile?.bpm === 'number' && Number.isFinite(profile.bpm)) lines.push('Tempo: ' + Math.round(profile.bpm) + ' BPM');
    if (profile?.key) lines.push('Key: ' + profile.key);
    if (profile?.mood) lines.push('Mood: ' + profile.mood);
    if (profile?.instruments) lines.push('Instrumentation: ' + profile.instruments);
    if (profile?.arrangement) lines.push('Arrangement: ' + profile.arrangement);
    lines.push('Keep the same musical identity, tempo feel, tonal center, instrumentation and mix character in every scene using this reference.');
  }
  for (const reference of sounds) {
    const profile = reference.soundProfile;
    lines.push('[SOUND DESIGN CONTINUITY: ' + reference.name + ']');
    if (reference.description.trim()) lines.push('Identity: ' + reference.description.trim());
    if (profile?.category) lines.push('Type: ' + profile.category);
    if (profile?.texture) lines.push('Texture: ' + profile.texture);
    if (profile?.intensity) lines.push('Intensity: ' + profile.intensity);
    if (profile?.spatial) lines.push('Spatial character: ' + profile.spatial);
    if (profile?.notes) lines.push('Continuity notes: ' + profile.notes);
    lines.push('Preserve the same recognizable sound character and spatial treatment wherever this reference is used.');
  }
  if (scene.soundDesign?.trim()) lines.push('SCENE-SPECIFIC SOUND EVENTS: ' + scene.soundDesign.trim());
  if (!lines.length) return '';
  return [
    'AUDIO CONTINUITY BRIEF — maintain a coherent soundtrack and sound world across scenes.',
    ...lines,
    'Do not introduce a new musical theme, instrument family, sound texture or abrupt mix change unless the scene direction explicitly requests it.',
  ].join('\n');
}
