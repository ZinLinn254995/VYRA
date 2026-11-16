/**
 * Structured production-planning contract for VYRA's Creative Director.
 *
 * The model uses this schema as an internal planning checklist and presents a
 * human-readable treatment. It is deliberately not persisted or executed by
 * itself; owner-scoped proposal tools remain the only route to mutations.
 */

export const CREATIVE_PRODUCTION_PLANNING_INSTRUCTION = [
  'STRUCTURED PRODUCTION PLANNING:',
  'Before responding to a film/video request, build a complete internal production plan with these sections:',
  'PROJECT BRIEF: user intent, requested duration and format, audience, genre, tone, explicit constraints, and assumptions that are safe to fill.',
  'STORY DESIGN: logline, dramatic question, character goals and motivations, conflict, stakes, emotional progression, turning point, climax, and ending.',
  'SCENE PLAN: an ordered list of scenes. For each scene define scene purpose, location/time, duration, participating characters, entry state, key action, exit state, emotional beat, and transition into the next scene. Scene durations must add up plausibly to the requested total duration.',
  'SHOT PLAN: for each scene, define ordered shots with shot purpose, approximate duration, framing/shot size, camera angle, camera movement, subject blocking/action, composition, lighting, focus/depth, and the information or emotion the shot must communicate. Vary shots intentionally; do not vary camera angles randomly.',
  'CONTINUITY PLAN: track each character’s position, facing, screen direction, pose, wardrobe, props, injuries, emotion, and physical condition; track location geography, lighting/time, and object positions. Every scene exit state must inform the next scene entry state. Record intentional changes explicitly.',
  'SOUND AND EDIT PLAN: dialogue or silence, ambience, music intent, sound effects, cut/transition choice, pacing, and any motivated slow motion or hold.',
  'GENERATION PLAN: identify which approved Project Assets are required as visual references, which shots can share references, what new reference/keyframe assets are needed, and which provider capabilities are actually available. Never imply a provider accepts a conditioning mode unless verified.',
  'QUALITY REVIEW: verify story logic, character motivation, spatial readability, duration budget, visual variety, continuity, feasibility, and fidelity to the user brief. Revise the plan before presenting it if any check fails.',
  'Keep this production plan structured internally. Present the user with a concise director’s treatment and the key scene/visual beats, not a wall of technical fields. Reveal shot-level detail when useful or requested.',
  'When the user asks you to execute an approved plan, inspect the exact owner-owned Storyboard and Scene records first. Use existing propose_scene_mutation with operation=create to prepare Scene previews, and use propose_scene_update or propose_scene_reorder only for exact verified Scene IDs. Never invent IDs or claim previews were saved. Because Scene creation currently requires one proposal per Scene and the tool-call budget is limited, create in safe batches and continue across turns rather than pretending the entire sequence was persisted at once.',
  'If there is no active Storyboard, do not silently create one or invent its ID. Explain the next supported step or use the existing Storyboard creation flow if its exact authorized capability is available.',
].join('\\n');

export type CreativeShotPlan = {
  id: string;
  purpose: string;
  durationSeconds: number;
  framing: string;
  cameraAngle: string;
  cameraMovement: string;
  action: string;
  continuityNotes: string[];
};

export type CreativeScenePlan = {
  id: string;
  title: string;
  purpose: string;
  durationSeconds: number;
  location: string;
  characters: string[];
  entryState: string;
  action: string;
  exitState: string;
  shots: CreativeShotPlan[];
};

export type CreativeProductionPlan = {
  title: string;
  logline: string;
  requestedDurationSeconds: number;
  genre: string;
  tone: string;
  scenes: CreativeScenePlan[];
};

export type CreativePlanValidation = {
  valid: boolean;
  errors: string[];
  totalSceneDurationSeconds: number;
};

/**
 * Validate the deterministic structure and duration budget of a proposed plan.
 * This does not certify visual quality or guarantee generated-video duration.
 */
export function validateCreativeProductionPlan(
  plan: CreativeProductionPlan,
  durationToleranceSeconds = 2,
): CreativePlanValidation {
  const errors: string[] = [];
  const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
  if (!plan.title.trim()) errors.push('Plan title is required.');
  if (!plan.logline.trim()) errors.push('A story logline is required.');
  if (!finitePositive(plan.requestedDurationSeconds)) errors.push('Requested duration must be positive.');
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    errors.push('At least one scene is required.');
  }
  const sceneIds = new Set<string>();
  let totalSceneDurationSeconds = 0;
  for (const [sceneIndex, scene] of (plan.scenes ?? []).entries()) {
    if (!scene.id.trim() || sceneIds.has(scene.id)) errors.push(`Scene ${sceneIndex + 1} must have a unique ID.`);
    sceneIds.add(scene.id);
    if (!scene.title.trim() || !scene.purpose.trim()) errors.push(`Scene ${sceneIndex + 1} needs a title and purpose.`);
    if (!finitePositive(scene.durationSeconds)) errors.push(`Scene ${sceneIndex + 1} needs a positive duration.`);
    else totalSceneDurationSeconds += scene.durationSeconds;
    if (!scene.location.trim()) errors.push(`Scene ${sceneIndex + 1} needs a location.`);
    if (!scene.characters.length) errors.push(`Scene ${sceneIndex + 1} must identify its characters or explicitly use an empty cast.`);
    if (!scene.entryState.trim() || !scene.exitState.trim()) errors.push(`Scene ${sceneIndex + 1} needs entry and exit continuity states.`);
    if (!scene.shots.length) errors.push(`Scene ${sceneIndex + 1} needs at least one shot.`);
    const shotIds = new Set<string>();
    for (const [shotIndex, shot] of scene.shots.entries()) {
      if (!shot.id.trim() || shotIds.has(shot.id)) errors.push(`Scene ${sceneIndex + 1}, shot ${shotIndex + 1} must have a unique ID.`);
      shotIds.add(shot.id);
      if (!finitePositive(shot.durationSeconds)) errors.push(`Scene ${sceneIndex + 1}, shot ${shotIndex + 1} needs a positive duration.`);
      if (![shot.purpose, shot.framing, shot.cameraAngle, shot.cameraMovement, shot.action].every((value) => value.trim())) {
        errors.push(`Scene ${sceneIndex + 1}, shot ${shotIndex + 1} is missing direction details.`);
      }
    }
  }
  if (finitePositive(plan.requestedDurationSeconds) &&
      Math.abs(totalSceneDurationSeconds - plan.requestedDurationSeconds) > durationToleranceSeconds) {
    errors.push(`Scene duration budget (${totalSceneDurationSeconds}s) does not match requested duration (${plan.requestedDurationSeconds}s).`);
  }
  return { valid: errors.length === 0, errors, totalSceneDurationSeconds };
}
