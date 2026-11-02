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
