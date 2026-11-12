import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Archive, Clock3, Copy, History, Lock, MessageSquare,
  MoreHorizontal, Plus, Share2, Trash2, Unlock, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { getCurrentAccessToken, supabase } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import type { VyralChatAssetContext } from '../../types/vyralChat';
import { encodeVyralDnaV3PngFromPackage, parseVyralManifest, readVyralZip, reconstructVyralDnaV3FromPackage, reconstructVyralFileDnaFromPackage } from '../../services/vyralPackage.ts';
import { analyzeVyralFileStructureV1, validateVyralFileDnaV1Record } from '../../services/vyralFileDnaV1.ts';
import { validateVyralMasterDnaV1 } from '../../services/vyralMasterDnaV1.ts';
import { buildVyralCreatorInventoryContextV1 } from '../../services/vyralCreatorInventoryContextV1.ts';
import { requestsVyralQualityEvaluationV1 } from '../../services/vyralQualityIntentV1.ts';
import { requestsVyralQualityHistoryV1 } from '../../services/vyralQualityHistoryIntentV1.ts';
import { requestsVyralAssetDnaAssessmentV1 } from '../../services/vyralAssetDnaAssessmentIntentV1.ts';
import { requestsVyralReconstructionHistoryV1 } from '../../services/vyralReconstructionHistoryIntentV1.ts';
import { summarizeVyralReconstructionEvidenceV1 } from '../../services/vyralReconstructionEvidenceSummaryV1.ts';
import { buildVyralDnaImprovementPlanV1 } from '../../services/vyralDnaImprovementPlanV1.ts';
import { extractGlobalChatNavigationTarget, extractStoryboardCreateRequest, extractStoryboardDetailTitle, extractStoryboardDeleteTitle, extractStoryboardUpdateRequest, findStoryboardMatches, formatStoryboardCreateDraft, formatStoryboardDeleteDraft, formatStoryboardDetail, formatStoryboardList, formatStoryboardUpdateDraft, isStoryboardCreateConfirmation, isStoryboardCreateIntent, isStoryboardDeleteConfirmation, isStoryboardDeleteIntent, isStoryboardListRequest, isStoryboardUpdateConfirmation, isStoryboardUpdateIntent, type GlobalChatNavigationTarget, type GlobalChatStoryboardAction, type GlobalChatStoryboardRecord } from '../../services/globalChatActions.ts';
import { mergeWorkspaceStoryboards } from '../../services/workspaceStoryboards.ts';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; status?: 'success' | 'preview' | 'error'; providerLabel?: string; action?: import('../../services/globalChatActions.ts').GlobalChatStoryboardAction };
type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  archived?: boolean;
  locked?: boolean;
};

type AIChatPageProps = {
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  initialSelectedAssets?: VyralChatAssetContext[];
  onSelectedAssetsChange?: (assets: VyralChatAssetContext[]) => void;
};

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type VyralVisionImage = { mimeType: 'image/jpeg'; data: string; width: number; height: number };

const createVyralVisionPreview = async (pngBytes: Uint8Array): Promise<VyralVisionImage> => {
  const pngBuffer = new ArrayBuffer(pngBytes.byteLength);
  new Uint8Array(pngBuffer).set(pngBytes);
  const bitmap = await createImageBitmap(new Blob([pngBuffer], { type: 'image/png' }));
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not prepare a safe Vyral image preview for AI Vision.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the Vyral AI Vision preview.')), 'image/jpeg', quality);
    });
    let preview = await encode(0.82);
    if (preview.size > 600 * 1024) preview = await encode(0.68);
    if (preview.size > 600 * 1024) preview = await encode(0.5);
    if (preview.size > 600 * 1024) throw new Error('This image preview is too large to send safely to AI Vision.');

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the Vyral AI Vision preview.'));
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid Vyral AI Vision preview.'));
      reader.readAsDataURL(preview);
    });
    const separator = dataUrl.indexOf(',');
    if (separator < 0) throw new Error('Invalid Vyral AI Vision preview encoding.');
    return { mimeType: 'image/jpeg', data: dataUrl.slice(separator + 1), width, height };
  } finally {
    bitmap.close();
  }
};


const createSelectedAssetVisionPreview = async (source: Blob): Promise<VyralVisionImage> => {
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not prepare the selected Asset for AI Vision.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(bitmap, 0, 0, width, height);
    let preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode selected Asset preview.')), 'image/jpeg', 0.82));
    if (preview.size > 600 * 1024) preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not compress selected Asset preview.')), 'image/jpeg', 0.55));
    if (preview.size > 600 * 1024) throw new Error('A selected image preview exceeds the AI Vision size limit.');
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('Could not read selected Asset preview.')); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid selected Asset preview.')); reader.readAsDataURL(preview); });
    const separator = dataUrl.indexOf(',');
    if (separator < 0) throw new Error('Invalid selected Asset preview encoding.');
    return { mimeType: 'image/jpeg', data: dataUrl.slice(separator + 1), width, height };
  } finally { bitmap.close(); }
};

const readBlobAsBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected media file.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Invalid media file encoding.'));
    reader.readAsDataURL(blob);
  });
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('Invalid media file encoding.');
  return dataUrl.slice(comma + 1);
};

const extractSelectedVideoFrames = async (
  source: Blob,
  assetId: string,
  assetName: string,
  maxFrames: number,
): Promise<(VyralVisionImage & { assetId: string; assetName: string })[]> => {
  if (maxFrames <= 0) return [];
  const objectUrl = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('This video format could not be opened for frame inspection.'));
    });
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('The first video frame could not be decoded.'));
      });
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable duration.');
    const frameCount = Math.min(4, maxFrames);
    const timestamps = Array.from({ length: frameCount }, (_, index) =>
      frameCount === 1 ? 0 : Math.min(Math.max(0, duration - 0.05), duration * index / frameCount)
    ).filter((time, index, all) => all.indexOf(time) === index);
    const frames: (VyralVisionImage & { assetId: string; assetName: string })[] = [];
    for (const time of timestamps) {
      if (Math.abs(video.currentTime - time) > 0.02) {
        await new Promise<void>((resolve, reject) => {
          const onSeeked = () => { cleanup(); resolve(); };
          const onError = () => { cleanup(); reject(new Error('A video frame could not be decoded.')); };
          const cleanup = () => { video.removeEventListener('seeked', onSeeked); video.removeEventListener('error', onError); };
          video.addEventListener('seeked', onSeeked, { once: true });
          video.addEventListener('error', onError, { once: true });
          video.currentTime = time;
        });
      }
      const scale = Math.min(1, 1024 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Could not prepare a video frame for AI Vision.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frameBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode a video frame.')), 'image/jpeg', 0.78)
      );
      const preview = await createSelectedAssetVisionPreview(frameBlob);
      const minutes = Math.floor(time / 60).toString().padStart(2, '0');
      const seconds = Math.floor(time % 60).toString().padStart(2, '0');
      frames.push({ ...preview, assetId, assetName: `${assetName} · ${minutes}:${seconds}` });
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
};

const canonicalizeAttachmentJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalizeAttachmentJson).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonicalizeAttachmentJson(record[key])).join(',') + '}';
};

const inspectVyralAttachment = async (file: File) => {
  if (file.size > 256 * 1024 * 1024) throw new Error('Vyral package exceeds the 256 MB safety limit.');
  const files = await readVyralZip(file);
  const manifest = parseVyralManifest(files);
  const v3Records = manifest.dnaRecords.filter((record) =>
    record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3
  );
  const fileRecords = manifest.dnaRecords.filter((record) =>
    record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1
  );
  if (v3Records.length + fileRecords.length > 64) throw new Error('This Vyral contains too many DNA records for one chat attachment.');
  const verified: { width: number; height: number; channels: string; digest: string; bytes: number }[] = [];
  const verifiedFiles: { assetId: string; assetName: string; mimeType: string; format: string; extension: string | null; bytes: number; digest: string; exactSourceBytes: boolean; verificationSource: string; structureProfile: string; structureStatus: string; structureFacts: string[]; structureNotes: string[] }[] = [];
  let totalDecodedBytes = 0;
  let totalFileBytes = 0;
  for (const record of v3Records) {
    const dna = record.dna_record as {
      decoded_image?: { width?: number; height?: number; channel_layout?: string };
    };
    const width = Number(dna.decoded_image?.width);
    const height = Number(dna.decoded_image?.height);
    const channels = dna.decoded_image?.channel_layout;
    const channelCount = channels === 'RGBA' ? 4 : channels === 'RGB' ? 3 : 0;
    const expectedBytes = width * height * channelCount;
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > 64 * 1024 * 1024) {
      throw new Error('A DNA image exceeds the 64 MB decoded-sample inspection limit.');
    }
    totalDecodedBytes += expectedBytes;
    if (totalDecodedBytes > 128 * 1024 * 1024) {
      throw new Error('This Vyral exceeds the 128 MB total DNA inspection limit.');
    }
    const reconstruction = await reconstructVyralDnaV3FromPackage(files, String(record.id));
    verified.push({
      width: reconstruction.width,
      height: reconstruction.height,
      channels: reconstruction.channel_layout,
      digest: reconstruction.decoded_samples_sha256,
      bytes: reconstruction.samples.byteLength,
    });
  }
  for (const record of fileRecords) {
    const dna = validateVyralFileDnaV1Record(record.dna_record);
    if (dna.source.asset_id !== record.asset_id) throw new Error('A File DNA record references a different Asset than its manifest entry.');
    const fileBytes = Number(dna.file.size_bytes);
    if (!Number.isSafeInteger(fileBytes) || fileBytes <= 0 || fileBytes > 128 * 1024 * 1024) {
      throw new Error('A File DNA asset exceeds the 128 MB chat inspection limit.');
    }
    totalFileBytes += fileBytes;
    if (totalFileBytes > 128 * 1024 * 1024) throw new Error('This Vyral exceeds the 128 MB total File DNA inspection limit.');
    let verifiedBytes: Uint8Array;
    let verificationSource: string;
    let exactSourceBytes = false;
    if (dna.reconstruction.claim === 'source_file_exact') {
      verifiedBytes = await reconstructVyralFileDnaFromPackage(files, String(record.id));
      verificationSource = 'lossless File DNA chunks';
      exactSourceBytes = true;
    } else {
      const sourceVersion = manifest.versions.find((version) => version.id === dna.source.asset_version_id);
      if (sourceVersion && sourceVersion.asset_id !== record.asset_id) throw new Error('A File DNA record is pinned to a different Asset version.');
      const packagePath = sourceVersion?.package_path;
      const sourceBytes = typeof packagePath === 'string' ? files.get(packagePath) : undefined;
      if (!sourceBytes) throw new Error('A File DNA record has neither exact reconstruction chunks nor its pinned source version.');
      if (sourceBytes.byteLength !== dna.file.size_bytes) throw new Error('A File DNA source version has a size mismatch.');
      const digest = await crypto.subtle.digest('SHA-256', sourceBytes.slice().buffer);
      const sourceSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (sourceSha256 !== dna.file.sha256) throw new Error('A File DNA source version failed its SHA-256 identity check.');
      verifiedBytes = sourceBytes;
      verificationSource = 'full-package original version';
    }
    const recordAsset = manifest.assets.find((item) => item.id === record.asset_id);
    const derivedStructure = analyzeVyralFileStructureV1(
      verifiedBytes,
      dna.file.mime_type,
      String(recordAsset?.original_filename ?? recordAsset?.name ?? ''),
    );
    if (dna.structure && canonicalizeAttachmentJson(dna.structure) !== canonicalizeAttachmentJson(derivedStructure)) {
      throw new Error('A File DNA structural profile does not match the independently re-analyzed source bytes.');
    }
    verifiedFiles.push({
      assetId: String(record.asset_id),
      assetName: String(recordAsset?.name ?? record.asset_id),
      mimeType: dna.file.mime_type,
      format: dna.file.format_signature,
      extension: dna.file.extension,
      bytes: verifiedBytes.byteLength,
      digest: dna.file.sha256,
      exactSourceBytes,
      verificationSource,
      structureProfile: derivedStructure.profile,
      structureStatus: derivedStructure.status,
      structureFacts: derivedStructure.facts.slice(0, 32).map((fact) => `${fact.key}=${String(fact.value)}${fact.unit ? ' ' + fact.unit : ''} [${fact.evidence}]`),
      structureNotes: derivedStructure.notes.slice(0, 8),
    });
  }
  const masterDna = manifest.masterDna ? await validateVyralMasterDnaV1(manifest.masterDna) : null;
  const creatorInventoryContext = buildVyralCreatorInventoryContextV1({
    assets: manifest.assets.map((item) => {
      const dnaAsset = masterDna?.assets.find((entry) => entry.asset_id === String(item.id));
      return {
        id: String(item.id),
        name: typeof item.name === 'string' ? item.name : null,
        asset_type: dnaAsset?.asset_type ?? null,
        mime_type: typeof item.mime_type === 'string' ? item.mime_type : null,
      };
    }),
    purpose: masterDna?.purpose ?? null,
    relationships: masterDna?.relationships ?? [],
  });
  if (masterDna && masterDna.vyral.vyral_id !== String(manifest.vyral.id)) {
    throw new Error('Vyral Master DNA identity does not match this package.');
  }
  const visionImages: (VyralVisionImage & { assetId: string; assetName: string })[] = [];
  for (const record of v3Records.slice(0, 4)) {
    const png = await encodeVyralDnaV3PngFromPackage(files, String(record.id));
    const preview = await createVyralVisionPreview(png.pngBytes);
    const recordAsset = manifest.assets.find((item) => item.id === record.asset_id) ?? manifest.assets[0];
    visionImages.push({ ...preview, assetId: String(record.asset_id), assetName: String(recordAsset?.name ?? record.asset_id) });
  }
  const firstV3Record = v3Records[0];
  const asset = firstV3Record
    ? manifest.assets.find((item) => item.id === firstV3Record.asset_id) ?? manifest.assets[0]
    : manifest.assets[0];
  const mode = manifest.exportMode === 'dna-only' ? 'DNA-only' : 'Full Vyral';
  const lines = [
    `Package: ${String(manifest.vyral.name)} (${mode})`,
    'VYRA CREATOR CONTEXT: Treat this Vyral as a creator-defined collection of Assets. Any supported asset types may be mixed, and Assets may be related or unrelated. No Main/Supporting role, purpose, story, character, world, style, or relationship is mandatory. An unclassified Asset is valid; do not invent missing metadata or relationships.',
    'COMPACT DNA POLICY: Compact DNA is a navigation/reference map, not the canonical Original Asset, a complete substitute for Original DNA, or an access credential. Use only the Assets relevant to the user’s request. Do not claim to have inspected or retrieved an Original Asset unless its bytes/content are actually present in this request or returned by an authorized VYRA resolver.',
    'EVIDENCE POLICY: Distinguish verified DNA/fingerprint facts, creator-declared metadata, AI suggestions, and untested assumptions. Reconstruction claims describe only the stated evidence level; visual similarity or semantic interpretation is not exact source-file recovery.',
    'CREATOR ASSISTANCE: If asked to improve this Vyral, first understand the creator’s intended task, then recommend only useful optional Assets, metadata, relationships, instructions, or tests. Explain why each recommendation helps; never turn suggestions into confirmed facts or require unrelated structure.',
    `Assets in package: ${manifest.assets.length} · DNA records with payloads: ${manifest.dnaRecords.length}`,
    `Creator inventory summary (verified package metadata only): ${creatorInventoryContext.assetCount} Assets; types ${Object.entries(creatorInventoryContext.typeCounts).map(([type, count]) => type + '=' + count).join(', ')}; declared purpose ${creatorInventoryContext.declaredPurpose ?? 'not provided'}; intended uses ${creatorInventoryContext.intendedUses.join(', ') || 'not provided'}; declared relationships ${creatorInventoryContext.relationshipsCount}`,
    'QUALITY STATUS: This inventory summary is not a grade. Do not invent a score or grade. A grade requires a versioned applicable standard and evidence for every applicable rule; missing evidence must remain incomplete.',
    `Asset inventory (showing up to 64 of ${manifest.assets.length}): ${manifest.assets.slice(0, 64).map((item) => `${String(item.name ?? item.id)} [${String(item.asset_type ?? 'unknown type')}; ${String(item.mime_type ?? 'unknown MIME')}]`).join('; ')}`,
    masterDna ? `Master DNA verified: revision ${masterDna.snapshot.revision} · ${masterDna.assets.length} total Vyral assets · fingerprint ${masterDna.integrity.vyral_fingerprint}` : 'No portable Master DNA snapshot is included.',
    ...(masterDna ? (() => { const assetName = (id: string) => String(manifest.assets.find((item) => item.id === id)?.name ?? id); const endpointName = (endpoint: { kind: 'asset' | 'vyral'; asset_id?: string; vyral_id?: string }) => endpoint.kind === 'asset' ? assetName(String(endpoint.asset_id)) : String(manifest.vyral.name); return [`Vyral purpose: ${masterDna.purpose?.summary ?? 'Not provided'}`, `Intended uses: ${(masterDna.purpose?.intended_uses ?? []).join(', ') || 'None declared'}`, `Asset inventory (showing up to 64 of ${masterDna.assets.length}): ${masterDna.assets.slice(0, 64).map((item) => `${assetName(item.asset_id)} [${item.role ?? 'unclassified'}; ${item.media_type}; purpose: ${item.purpose ?? 'Not provided'}; reconstruction: ${item.reconstruction_claim}; DNA ref: ${item.dna_ref.record_id}]`).join('; ')}`, `Asset relationships (showing up to 128 of ${(masterDna.relationships ?? []).length}): ${(masterDna.relationships ?? []).slice(0, 128).map((item) => `${endpointName(item.from)} --${item.type}--> ${endpointName(item.to)} (reason: ${item.rationale})`).join('; ')}`, `Cross-asset constraints: ${(masterDna.reconstruction_profile.cross_asset_constraints ?? []).map((item) => item.description).join('; ') || 'None declared'}`, `Reconstruction notes: ${masterDna.reconstruction_profile.notes.join('; ')}`, `Overall reconstruction claim: ${masterDna.reconstruction_profile.overall_claim}`, `Visual access boundary: ${visionImages.length} of ${v3Records.length} raster DNA v3 asset previews are attached to this Vision request (maximum four); File DNA binaries are integrity-checked but their audio/video/document contents are not decoded or attached to Vision.`]; })() : []),
    ...verified.map((item) =>
      `Raster DNA v3 verified: ${item.width}×${item.height} ${item.channels}; ${item.bytes.toLocaleString()} decoded bytes; SHA-256 ${item.digest}`
    ),
    ...verifiedFiles.map((item) =>
      `File DNA v1 verified for ${item.assetName} (${item.assetId}): ${item.mimeType}; format signature ${item.format}; extension ${item.extension ?? 'unknown'}; ${item.bytes.toLocaleString()} bytes; SHA-256 ${item.digest}; verification source: ${item.verificationSource}; exact source bytes reconstructed from DNA: ${item.exactSourceBytes ? 'yes' : 'no'}; structural profile: ${item.structureProfile} (${item.structureStatus}); structural facts: ${item.structureFacts.join(', ') || 'none'}; parser notes: ${item.structureNotes.join('; ') || 'none'}; semantic content was not inferred or attached to Vision`
    ),
    v3Records.length === 0 && fileRecords.length === 0 ? 'No supported portable Asset DNA v3 or File DNA v1 reconstruction record was found in this package.' : '',
    asset?.name ? `Selected asset: ${String(asset.name)}` : '',
    ...visionImages.map((item, index) => `AI Vision preview ${index + 1}: ${item.assetName} (${item.assetId}), ${item.width}×${item.height} JPEG derivative; lossless DNA remains unchanged`),
  ].filter(Boolean);
  return { context: lines.join('\n'), visionImages, vyralId: String(manifest.vyral.id) };
};

export const AIChatPage: React.FC<AIChatPageProps> = ({ isAuthenticated, onLoginRequired, initialSelectedAssets = [], onSelectedAssetsChange }) => {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileStatus, setSelectedFileStatus] = useState<string | null>(null);
  const [selectedVyralContext, setSelectedVyralContext] = useState<string | null>(null);
  const [selectedVyralId, setSelectedVyralId] = useState<string | null>(null);
  const [selectedVyralImages, setSelectedVyralImages] = useState<(VyralVisionImage & { assetId: string; assetName: string })[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<VyralChatAssetContext[]>(initialSelectedAssets);
  const [isSending, setIsSending] = useState(false);
  const [historyOwnerId, setHistoryOwnerId] = useState<string | null>(null);
  const [historyAuthRevision, setHistoryAuthRevision] = useState(0);
  const historyOwnerRef = useRef<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSelectedAssets(initialSelectedAssets); }, [initialSelectedAssets]);

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setHistoryAuthRevision((revision) => revision + 1);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const supabaseClient = supabase;
    if (!isAuthenticated || !supabaseClient) {
      historyOwnerRef.current = null;
      setHistoryOwnerId(null);
      setSessions([]);
      setMessages([]);
      setActiveSessionId(null);
      setIsLocked(false);
      setHistoryError(null);
      setHistoryReady(true);
      return () => { active = false; };
    }

    setHistoryReady(false);
    setHistoryError(null);
    const loadHistory = async () => {
      const { data: userResult, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !userResult.user) throw new Error('Sign in again to load your saved conversations.');
      const ownerId = userResult.user.id;
      const { data, error } = await supabaseClient
        .from('vyra_ai_chat_conversations')
        .select('id,title,messages,archived,locked,updated_at')
        .eq('user_id', ownerId)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Saved chat history is temporarily unavailable.');
      if (historyOwnerRef.current && historyOwnerRef.current !== ownerId) {
        setMessages([]);
        setActiveSessionId(null);
        setIsLocked(false);
      }
      historyOwnerRef.current = ownerId;
      const loaded = (data ?? []).map((row) => {
        const rawMessages = Array.isArray(row.messages) ? row.messages : [];
        const safeMessages = rawMessages.flatMap((item: unknown) => {
          if (!item || typeof item !== 'object') return [];
          const message = item as Record<string, unknown>;
          if (typeof message.id !== 'string' ||
              (message.role !== 'user' && message.role !== 'assistant') ||
              typeof message.content !== 'string') return [];
          return [{
            id: message.id,
            role: message.role,
            content: message.content,
            ...(message.status === 'success' || message.status === 'preview' || message.status === 'error' ? { status: message.status } : {}),
            ...(typeof message.providerLabel === 'string' ? { providerLabel: message.providerLabel } : {}),
            ...(message.action && typeof message.action === 'object' && (['storyboard-create-draft', 'storyboard-create-complete', 'storyboard-update-draft', 'storyboard-update-complete', 'storyboard-delete-draft', 'storyboard-delete-complete'].includes(String((message.action as Record<string, unknown>).type))) ? { action: message.action as GlobalChatStoryboardAction } : {}),
          } as ChatMessage];
        });
        const date = new Date(row.updated_at);
        return {
          id: row.id,
          title: typeof row.title === 'string' ? row.title : 'New chat',
          updatedAt: Number.isNaN(date.getTime()) ? 'Saved' : date.toLocaleDateString(),
          messages: safeMessages,
          archived: Boolean(row.archived),
          locked: Boolean(row.locked),
        } as ChatSession;
      }).filter((session) => session.messages.length > 0);
      if (!active) return;
      setHistoryOwnerId(ownerId);
      setSessions(loaded);
    };

    void loadHistory()
      .catch((error) => {
        if (!active) return;
        setHistoryOwnerId(null);
        setHistoryError(error instanceof Error ? error.message : 'Saved chat history could not be loaded.');
      })
      .finally(() => { if (active) setHistoryReady(true); });
    return () => { active = false; };
  }, [isAuthenticated, historyAuthRevision]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Measure and apply height before paint so the composer never flashes between sizes.
    textarea.style.height = 'auto';
    const nextHeight = Math.min(textarea.scrollHeight, 144);
    textarea.style.height = `${nextHeight}px`;
    const nextIsMultiline = nextHeight > 48;
    setIsMultiline((current) => current === nextIsMultiline ? current : nextIsMultiline);
  }, [draft]);

  const hasMessages = messages.length > 0;
  const currentTitle = useMemo(() => {
    const firstUserMessage = messages.find((message) => message.role === 'user')?.content ?? '';
    return firstUserMessage.length > 42 ? firstUserMessage.slice(0, 42) + '…' : firstUserMessage || 'New chat';
  }, [messages]);

  const persistSession = useCallback(async (session: ChatSession) => {
    if (!supabase || !historyOwnerId) return false;
    const storedMessages = session.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      ...(message.status ? { status: message.status } : {}),
      ...(message.providerLabel ? { providerLabel: message.providerLabel } : {}),
      ...(message.action ? { action: message.action } : {}),
    }));
    const { error } = await supabase.from('vyra_ai_chat_conversations').upsert({
      id: session.id,
      user_id: historyOwnerId,
      title: (session.title || 'New chat').slice(0, 160),
      messages: storedMessages,
      archived: Boolean(session.archived),
      locked: Boolean(session.locked),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) {
      setHistoryError('Chat history could not be saved. Please keep this page open and retry.');
      return false;
    }
    setHistoryError(null);
    return true;
  }, [historyOwnerId]);

  useEffect(() => {
    if (!historyReady || !historyOwnerId || !activeSessionId || !messages.length) return;
    const session: ChatSession = {
      id: activeSessionId,
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived: false,
      locked: isLocked,
    };
    const timeout = window.setTimeout(() => {
      void persistSession(session).then((saved) => {
        if (saved) setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
      });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [historyReady, historyOwnerId, activeSessionId, messages, currentTitle, isLocked, persistSession]);

  const saveCurrentSession = async (archived = false) => {
    if (!hasMessages) return;
    const session: ChatSession = {
      id: activeSessionId ?? crypto.randomUUID(),
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived,
      locked: isLocked,
    };
    setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
    await persistSession(session);
  };

  const startNewChat = async () => {
    await saveCurrentSession();
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    setSelectedAssets([]); onSelectedAssetsChange?.([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const openSession = (session: ChatSession) => {
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setIsLocked(Boolean(session.locked));
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    setSelectedAssets([]); onSelectedAssetsChange?.([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDraft('');
    setHistoryOpen(false);
  };

  const sendMessage = async (value = draft) => {
    const text = value.trim();
    if ((!text && !selectedFile && !selectedAssets.length) || isLocked || isSending) return;
    const requestsVyralQuality = requestsVyralQualityEvaluationV1(text);
    const requestsVyralQualityHistory = requestsVyralQualityHistoryV1(text);
    const requestsAssetDnaAssessment = requestsVyralAssetDnaAssessmentV1(text);
    const prepareDnaChangeSet = /^\s*(?:prepare(?: dna)? change set|build(?: dna)? change set|ပြင်ဆင်ချက်(?:များ)? ပြင်ဆင်|change set ပြင်ဆင်)\s*$/i.test(text);
    const validateDnaChangeSet = /^\s*(?:validate(?: dna)? change set|check(?: dna)? change set|DNA change set စစ်ဆေး)\s*$/i.test(text);
    const applyDnaChangeSet = /^\s*(?:apply(?: dna)? change set|apply dna revision|DNA change set အသုံးချ)\s*$/i.test(text);
    const reviewDnaEvidence = /^\s*(?:review|list|show) (?:vision )?(?:dna )?evidence\s*$/i.test(text);
    const creatorObservationAction = text.match(/^\s*(confirm|dispute) observation ([0-9a-f-]{36})\s*$/i);
    const promoteObservationField = text.match(/^\s*promote observation ([0-9a-f-]{36}) field ([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)(?: as ([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*))?\s*$/i);
    const proposalAction = /^\s*(?:approve(?: dna (?:improvement )?plan)?|အတည်ပြု(?:မယ်)?|လက်ခံမယ်)\s*$/i.test(text)
      ? 'approve'
      : /^\s*(?:reject(?: dna (?:improvement )?plan)?|decline|မလုပ်တော့|ပယ်ချမယ်)\s*$/i.test(text)
        ? 'reject' : null;
    const requestsVyralReconstructionHistory = requestsVyralReconstructionHistoryV1(text);
    const qualityVyralIds = [...new Set([
      ...selectedAssets.map((asset) => asset.vyralId),
      ...(selectedFile?.name.toLowerCase().endsWith('.vyral') && selectedVyralId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedVyralId) ? [selectedVyralId] : []),
    ])];
    if (selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    let visionImages = [...selectedVyralImages];
    const mediaFiles: {
      mimeType: 'application/pdf' | 'audio/mpeg' | 'audio/wav' | 'audio/ogg' | 'audio/flac' | 'audio/aac';
      data: string;
      assetId?: string;
      assetName?: string;
    }[] = [];
    const attachmentText = selectedFile
      ? `\n\nAttached file: ${selectedFile.name} (${selectedFile.type || 'application/octet-stream'}, ${selectedFile.size.toLocaleString()} bytes)${selectedVyralContext ? `\n\n${selectedVyralContext}` : selectedFileStatus ? `\n${selectedFileStatus}` : ''}`
      : '';
    const assetContextText = selectedAssets.length ? '\n\nSelected VYRA Assets (explicit user-selected context):\n' + selectedAssets.map((asset, index) => `${index + 1}. ${asset.name} [${asset.assetType}; ${asset.mimeType}] — Vyral: ${asset.vyralName}; Asset ID: ${asset.id}; Visibility: ${asset.visibility}; Description: ${asset.description || 'Not provided'}`).join('\n') + '\nUse only these selected Assets as the requested VYRA library context. This selection does not grant public access; private Assets are owner-authorized context only.' : '';
    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: (text || (selectedAssets.length ? 'Please use the selected VYRA Assets as context.' : 'Please inspect this attachment.')) + attachmentText + assetContextText,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    setSelectedAssets([]); onSelectedAssetsChange?.([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!activeSessionId) setActiveSessionId(crypto.randomUUID());

    setIsSending(true);
    let streamingAssistantId: string | null = null;
    let streamedText = '';
    try {
      const navigationTarget = extractGlobalChatNavigationTarget(text);
      if (navigationTarget && !selectedFile && selectedAssets.length === 0) {
        const destinationLabels: Record<GlobalChatNavigationTarget, string> = {
          workspace: 'Workspace',
          marketplace: 'Marketplace',
          'my-vyrals': 'My Vyrals',
          'my-media-library': 'My Media Library',
        };
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          content: 'Opening ' + destinationLabels[navigationTarget] + '… Your conversation has been saved.',
          status: 'success',
        };
        const sessionId = activeSessionId ?? crypto.randomUUID();
        const sessionToSave: ChatSession = {
          id: sessionId,
          title: (() => { const firstUserText = nextMessages.find((message) => message.role === 'user')?.content ?? text; return firstUserText.length > 42 ? firstUserText.slice(0, 42) + '…' : firstUserText || 'New chat'; })(),
          updatedAt: 'Just now',
          messages: [...nextMessages, assistantMessage],
          archived: false,
          locked: isLocked,
        };
        const saved = await persistSession(sessionToSave);
        if (!saved) throw new Error('I could not confirm that this conversation was saved. Please stay here and try again.');
        setMessages(sessionToSave.messages);
        setActiveSessionId(sessionId);
        setSessions((previous) => [sessionToSave, ...previous.filter((item) => item.id !== sessionId)]);
        window.dispatchEvent(new CustomEvent('vyra:global-chat-navigate', { detail: { target: navigationTarget } }));
        return;
      }

      if (isStoryboardDeleteConfirmation(text) && !selectedFile && selectedAssets.length === 0) {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-delete-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-delete-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard has already been deleted. I did not repeat the action.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard deletion is unavailable in this environment.');
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authError || !authData.user) throw new Error('Sign in again before deleting this Storyboard.');
          const { data: currentCloud, error: loadError } = await supabase.from('vyral_storyboards')
            .select('id,updated_at')
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id)
            .maybeSingle();
          if (loadError) throw new Error('I could not verify this Storyboard before deletion. Nothing was deleted.');
          if (currentCloud && String(currentCloud.updated_at) !== draft.expectedUpdatedAt) {
            throw new Error('This Storyboard changed after the delete preview was prepared. Nothing was deleted. Ask me to prepare the delete again.');
          }
          if (currentCloud) {
            const { data: deletedRows, error: deleteError } = await supabase.from('vyral_storyboards')
              .delete()
              .eq('id', draft.storyboardId)
              .eq('user_id', authData.user.id)
              .eq('updated_at', draft.expectedUpdatedAt)
              .select('id');
            if (deleteError) throw new Error('I could not delete this Storyboard from the cloud. Please retry confirmation. ' + deleteError.message);
            if (!deletedRows?.length) throw new Error('This Storyboard changed or was removed before deletion completed. Nothing else was changed.');
          }
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(cached)) {
              localStorage.setItem(storageKey, JSON.stringify(cached.filter((item) =>
                !item || typeof item !== 'object' || (item as Record<string, unknown>).id !== draft.storyboardId
              )));
            }
          } catch {
            // The cloud row is authoritative; Workspace can rebuild its cache from cloud on next load.
          }
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: '**Storyboard deleted:** ' + draft.storyboardTitle + '\nIt has been removed from your Workspace.',
            status: 'success',
            action: { type: 'storyboard-delete-complete', draftId: draft.id },
          }]);
          return;
        }
      }

      if (isStoryboardUpdateConfirmation(text) && !selectedFile && selectedAssets.length === 0) {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-update-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-update-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard update has already been saved. I did not apply it again.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard updates are unavailable in this environment.');
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authError || !authData.user) throw new Error('Sign in again before updating this Storyboard.');
          const { data: currentCloud, error: loadError } = await supabase.from('vyral_storyboards')
            .select('id,title,topic,created_at,updated_at')
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id)
            .maybeSingle();
          if (loadError) throw new Error('I could not verify this Storyboard before updating it. Please retry confirmation.');
          if (!currentCloud) throw new Error('This Storyboard is no longer available in your account. No changes were made.');
          if (String(currentCloud.updated_at) !== draft.expectedUpdatedAt) throw new Error('This Storyboard changed after the draft was prepared. Ask me to prepare the update again so no newer changes are overwritten.');
          const now = new Date().toISOString();
          const patch = draft.field === 'title'
            ? { title: draft.nextValue, updated_at: now }
            : { topic: draft.nextValue, updated_at: now };
          const { error: updateError } = await supabase.from('vyral_storyboards')
            .update(patch)
            .eq('id', draft.storyboardId)
            .eq('user_id', authData.user.id);
          if (updateError) throw new Error('I could not save this Storyboard update. Please retry confirmation. ' + updateError.message);
          let cacheWarning = '';
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (Array.isArray(cached)) {
              const nextCache = cached.map((item) => {
                if (!item || typeof item !== 'object' || (item as Record<string, unknown>).id !== draft.storyboardId) return item;
                return {
                  ...(item as Record<string, unknown>),
                  [draft.field === 'title' ? 'title' : 'topic']: draft.nextValue,
                  updatedAt: now,
                };
              });
              localStorage.setItem(storageKey, JSON.stringify(nextCache));
            }
          } catch {
            cacheWarning = ' The cloud copy is saved; the device cache will refresh when Workspace opens.';
          }
          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: 'assistant',
            content: '**Storyboard updated:** ' + draft.storyboardTitle + '\n' +
              (draft.field === 'title' ? 'Title: ' : 'Topic: ') + draft.nextValue + cacheWarning,
            status: 'success',
            action: { type: 'storyboard-update-complete', draftId: draft.id },
          };
          setMessages((previous) => [...previous, assistantMessage]);
          return;
        }
      }

      if (isStoryboardCreateConfirmation(text) && !selectedFile && selectedAssets.length === 0) {
        const previousAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
        const pendingAction = previousAssistant?.action;
        if (pendingAction?.type === 'storyboard-create-draft') {
          const draft = pendingAction.draft;
          const alreadyCompleted = messages.some((message) =>
            message.role === 'assistant' && message.action?.type === 'storyboard-create-complete' &&
            message.action.draftId === draft.id
          );
          if (alreadyCompleted) {
            setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'This Storyboard draft has already been created. I did not create a duplicate.', status: 'success' }]);
            return;
          }
          if (!supabase) throw new Error('Storyboard creation is unavailable in this environment.');
          const { data: authData, error: authError } = await supabase.auth.getUser();
          if (authError || !authData.user) throw new Error('Sign in again before creating a Storyboard.');
          const now = new Date().toISOString();
          const storyboard = {
            id: draft.id,
            user_id: authData.user.id,
            title: draft.title,
            topic: draft.topic,
            details: { category: '', style: '', mood: '', tags: [], origins: {} },
            created_at: now,
            updated_at: now,
          };
          const { data: existingCloud, error: existingError } = await supabase.from('vyral_storyboards')
            .select('id,created_at,updated_at')
            .eq('id', draft.id)
            .eq('user_id', authData.user.id)
            .maybeSingle();
          if (existingError) throw new Error('I could not verify whether this Storyboard was already saved. Please retry confirmation.');
          let savedCreatedAt = now;
          let savedUpdatedAt = now;
          if (existingCloud) {
            savedCreatedAt = String(existingCloud.created_at || now);
            savedUpdatedAt = String(existingCloud.updated_at || now);
          } else {
            const { error: createError } = await supabase.from('vyral_storyboards').insert(storyboard);
            if (createError) throw new Error('I could not save this Storyboard. Nothing was reported as created. ' + createError.message);
          }
          let cacheWarning = '';
          try {
            const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
            const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const existing = Array.isArray(cached) ? cached.filter((item) =>
              Boolean(item) && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string'
            ) as Record<string, unknown>[] : [];
            const localRecord = {
              id: draft.id, title: draft.title, topic: draft.topic,
              details: storyboard.details, createdAt: savedCreatedAt, updatedAt: savedUpdatedAt,
            };
            localStorage.setItem(storageKey, JSON.stringify([localRecord, ...existing.filter((item) => item.id !== draft.id)]));
          } catch {
            cacheWarning = ' The cloud copy is saved; the device cache will refresh when Workspace opens.';
          }
          const assistantMessage: ChatMessage = {
            id: makeId(),
            role: 'assistant',
            content: '**Storyboard created:** ' + draft.title + '\\n\\n' + draft.topic + cacheWarning,
            status: 'success',
            action: { type: 'storyboard-create-complete', draftId: draft.id },
          };
          setMessages((previous) => [...previous, assistantMessage]);
          return;
        }
      }

      if (isStoryboardDeleteIntent(text) && !selectedFile && selectedAssets.length === 0) {
        const requestedTitle = extractStoryboardDeleteTitle(text);
        if (!requestedTitle) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'Tell me the exact Storyboard title you want to delete. Example: Delete storyboard "Moon Journey". I will show a confirmation preview before deleting anything.',
            status: 'success',
          }]);
          return;
        }
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sign in again to manage your Workspace Storyboards.');
        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Use the account-scoped cloud rows if local cache is malformed.
        }
        const { data, error: loadError } = await supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false });
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);
        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id), title: String(row.title), topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at), updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, requestedTitle);
        if (!matches.length) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I could not find a Storyboard matching "' + requestedTitle + '". Nothing was deleted.', status: 'success' }]);
          return;
        }
        if (matches.length > 1) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I found multiple matching Storyboards. Please use the exact title:\n' + matches.map((item) => '• ' + item.title).join('\n'), status: 'success' }]);
          return;
        }
        const item = matches[0];
        const draft = {
          id: crypto.randomUUID(),
          storyboardId: item.id,
          storyboardTitle: item.title,
          expectedUpdatedAt: item.updatedAt,
        };
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardDeleteDraft(draft),
          status: 'preview', action: { type: 'storyboard-delete-draft', draft },
        }]);
        return;
      }

      if (isStoryboardUpdateIntent(text) && !selectedFile && selectedAssets.length === 0) {
        const parsed = extractStoryboardUpdateRequest(text);
        if (!parsed) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'Tell me the exact Storyboard title, the field (title or topic), and the new value. Example: Update storyboard "Moon Journey" topic to A child explores Mars.',
            status: 'success',
          }]);
          return;
        }
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sign in again to update your Workspace Storyboards.');
        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Continue with the account-scoped cloud copy if the device cache is malformed.
        }
        const { data, error: loadError } = await supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false });
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);
        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id), title: String(row.title), topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at), updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, parsed.storyboardTitle);
        if (!matches.length) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I could not find a Storyboard matching "' + parsed.storyboardTitle + '". No changes were made.', status: 'success' }]);
          return;
        }
        if (matches.length > 1) {
          setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: 'I found multiple matching Storyboards. Please use the exact title:\n' + matches.map((item) => '• ' + item.title).join('\n'), status: 'success' }]);
          return;
        }
        const item = matches[0];
        const draft = {
          id: crypto.randomUUID(),
          storyboardId: item.id,
          storyboardTitle: item.title,
          field: parsed.field,
          previousValue: parsed.field === 'title' ? item.title : item.topic,
          expectedUpdatedAt: item.updatedAt,
          nextValue: parsed.value,
        } as const;
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardUpdateDraft(draft),
          status: 'preview', action: { type: 'storyboard-update-draft', draft },
        }]);
        return;
      }

      if (isStoryboardCreateIntent(text) && !selectedFile && selectedAssets.length === 0) {
        const parsed = extractStoryboardCreateRequest(text);
        if (!parsed?.topic) {
          setMessages((previous) => [...previous, {
            id: makeId(), role: 'assistant',
            content: 'What should the Storyboard be about? Tell me the topic or short video idea, and I will prepare a draft for you to review.',
            status: 'success',
          }]);
          return;
        }
        const title = parsed.title.trim() || parsed.topic.trim().slice(0, 80) || 'Untitled Storyboard';
        const draft = { id: crypto.randomUUID(), title, topic: parsed.topic.trim() };
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: 'assistant',
          content: formatStoryboardCreateDraft(draft),
          status: 'preview',
          action: { type: 'storyboard-create-draft', draft },
        };
        setMessages((previous) => [...previous, assistantMessage]);
        return;
      }

      const requestedStoryboardTitle = extractStoryboardDetailTitle(text);
      if (requestedStoryboardTitle && !selectedFile && selectedAssets.length === 0) {
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sign in again to access your Workspace Storyboards.');

        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // Ignore malformed device cache and continue with the account-scoped cloud query.
        }

        const { data, error: loadError } = await supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false });
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);

        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        const matches = findStoryboardMatches(merged, requestedStoryboardTitle);
        let response: string;
        if (!matches.length) {
          response = 'I could not find a Storyboard matching "' + requestedStoryboardTitle + '". Ask me to show your Storyboards to see the available titles.';
        } else if (matches.length > 1) {
          response = 'I found more than one matching Storyboard. Please use its exact title:\\n' +
            matches.map((item) => '• ' + item.title).join('\\n');
        } else {
          response = formatStoryboardDetail(matches[0]);
        }
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: response, status: 'success' }]);
        return;
      }

      if (isStoryboardListRequest(text) && !selectedFile && selectedAssets.length === 0) {
        if (!supabase) throw new Error('Workspace Storyboard access is unavailable in this environment.');
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) throw new Error('Sign in again to access your Workspace Storyboards.');

        const storageKey = 'vyra_storyboards_v1:' + authData.user.id;
        let localStoryboards: GlobalChatStoryboardRecord[] = [];
        try {
          const cached: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
          if (Array.isArray(cached)) {
            localStoryboards = cached.filter((item): item is GlobalChatStoryboardRecord =>
              Boolean(item) && typeof item.id === 'string' && typeof item.title === 'string' &&
              typeof item.topic === 'string' && typeof item.createdAt === 'string' &&
              typeof item.updatedAt === 'string'
            );
          }
        } catch {
          // A malformed local cache must not prevent reading the account's cloud Storyboards.
        }

        const { data, error: loadError } = await supabase.from('vyral_storyboards')
          .select('id,title,topic,details,created_at,updated_at')
          .eq('user_id', authData.user.id)
          .order('updated_at', { ascending: false });
        if (loadError) throw new Error('Could not load your Workspace Storyboards: ' + loadError.message);

        const remoteStoryboards: GlobalChatStoryboardRecord[] = (data ?? []).map((row) => ({
          id: String(row.id),
          title: String(row.title),
          topic: String(row.topic ?? ''),
          details: row.details && typeof row.details === 'object' ? row.details as { scenes?: unknown[] } : {},
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        }));
        const merged = mergeWorkspaceStoryboards(localStoryboards, remoteStoryboards).storyboards;
        setMessages((previous) => [...previous, {
          id: makeId(), role: 'assistant', content: formatStoryboardList(merged), status: 'success',
        }]);
        return;
      }

      if (reviewDnaEvidence) {
        if (selectedAssets.length !== 1) throw new Error('Select one Asset before reviewing its Vision evidence.');
        if (!supabase) throw new Error('Vision evidence review is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const { data: observations, error: observationsError } = await supabase
          .from('vyral_vision_observations')
          .select('id,asset_version_id,task_kind,model_provider,model_id,observation,source_sha256,verification_status,created_at')
          .eq('asset_id', selectedAsset.id).order('created_at', { ascending: false }).limit(10);
        if (observationsError) throw new Error('Could not load Vision observations: ' + observationsError.message);
        const lines = ['Recent Vision observations for ' + selectedAsset.name + ':'];
        if (!observations?.length) lines.push('No Vision observations have been recorded for this Asset.');
        for (const item of observations ?? []) {
          const summary = typeof item.observation?.summary === 'string' ? item.observation.summary : 'No summary provided.';
          const sourceMatches = Boolean(item.asset_version_id && item.source_sha256);
          lines.push(
            '',
            'Observation ID: ' + item.id,
            'Task: ' + item.task_kind + ' · status: ' + item.verification_status,
            'Source version pinned: ' + (sourceMatches ? item.asset_version_id : 'No — cannot be promoted'),
            'Source SHA-256: ' + (item.source_sha256 ?? 'Missing'),
            'Summary: ' + summary,
            'Model claim: ' + item.model_provider + ' / ' + item.model_id,
          );
        }
        lines.push('', 'To confirm or dispute one, send: confirm observation <ID> or dispute observation <ID>.');
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: lines.join('\\n'), status: 'preview' }]);
        return;
      }
      if (creatorObservationAction) {
        if (selectedAssets.length !== 1) throw new Error('Select the Asset that owns the Vision observation before reviewing it.');
        if (!supabase) throw new Error('Creator evidence review is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const observationId = creatorObservationAction[2];
        const { data: observation, error: observationError } = await supabase
          .from('vyral_vision_observations').select('id,asset_id').eq('id', observationId)
          .eq('asset_id', selectedAsset.id).maybeSingle();
        if (observationError || !observation) throw new Error('That observation does not belong to the selected Asset.');
        const decision = creatorObservationAction[1].toLowerCase() === 'confirm' ? 'creator_confirmed' : 'disputed';
        const { data: result, error: reviewError } = await supabase.functions.invoke('record-vyral-vision-review', {
          body: { observationId, decision },
        });
        if (reviewError) {
          let message = 'Creator review could not be recorded.';
          try { const payload = await (reviewError as { context?: Response }).context?.clone().json() as { error?: string } | undefined; if (payload?.error) message = payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant',
          content: 'Creator review recorded: ' + decision + '\\nEvidence ID: ' + String(result?.reviewId ?? 'unavailable') +
            '\\nPinned to Asset Version: ' + String(result?.sourceVersionId ?? 'unavailable') +
            '\\nSource SHA-256: ' + String(result?.sourceSha256 ?? 'unavailable') +
            '\\nAsset DNA changed: No.', status: 'success' }]);
        return;
      }
      if (promoteObservationField) {
        if (selectedAssets.length !== 1) throw new Error('Select the Asset that owns the Vision observation before confirming a DNA field.');
        if (!supabase) throw new Error('Field confirmation is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const observationId = promoteObservationField[1];
        const observationFieldPath = promoteObservationField[2];
        const fieldPath = promoteObservationField[3] || ('knowledge.' + observationFieldPath);
        const { data: observation, error: observationError } = await supabase
          .from('vyral_vision_observations').select('id,asset_id,observation')
          .eq('id', observationId).eq('asset_id', selectedAsset.id).maybeSingle();
        if (observationError || !observation) throw new Error('That observation does not belong to the selected Asset.');
        let acceptedValue: unknown = observation.observation;
        for (const part of observationFieldPath.split('.')) {
          if (!acceptedValue || typeof acceptedValue !== 'object' || Array.isArray(acceptedValue) ||
              !Object.prototype.hasOwnProperty.call(acceptedValue, part)) throw new Error('The requested field does not exist in this Vision observation.');
          acceptedValue = (acceptedValue as Record<string, unknown>)[part];
        }
        const { data: result, error: promoteError } = await supabase.functions.invoke('promote-vyral-vision-field', {
          body: { observationId, fieldPath, observationFieldPath, acceptedValue },
        });
        if (promoteError) {
          let message = 'Creator field confirmation could not be saved.';
          try { const payload = await (promoteError as { context?: Response }).context?.clone().json() as { error?: string } | undefined; if (payload?.error) message = payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant',
          content: 'Creator-confirmed field evidence saved.\\nField: ' + fieldPath +
            '\\nEvidence ID: ' + String(result?.evidenceId ?? 'unavailable') +
            '\\nThe evidence is pinned to the original Asset Version and SHA-256. DNA has not been changed.',
          status: 'success' }]);
        return;
      }

      if (applyDnaChangeSet) {
        if (selectedAssets.length !== 1) throw new Error('To apply a DNA change set, select exactly one Asset.');
        if (!supabase) throw new Error('Secure DNA revision creation is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const {data: approved,error: approvedError} = await supabase.from('vyral_asset_dna_improvement_proposals')
          .select('id,status,change_set_status,change_set_validation_report').eq('asset_id',selectedAsset.id)
          .in('status',['approved','applied']).eq('change_set_status','validated').not('change_set_validation_report','is',null)
          .order('created_at',{ascending:false}).limit(1).maybeSingle();
        if (approvedError) throw new Error('Could not load the validated DNA change set: '+approvedError.message);
        if (!approved) throw new Error('No fully validated DNA change set exists for this Asset. Validate its approved change set first.');
        const {data: applied,error: applyError} = await supabase.functions.invoke('manage-vyral-asset-dna-proposal',{body:{action:'apply_change_set',proposalId:approved.id}});
        if (applyError) {
          let message='VYRA could not create the new DNA revision.';
          try { const payload=await (applyError as {context?:Response}).context?.clone().json() as {error?:string}|undefined; if(payload?.error) message=payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        if (!applied?.dnaRecord?.id) throw new Error('The atomic DNA revision response was incomplete.');
        const lines=[
          'Validated DNA change set applied successfully.',
          'New DNA Record: '+String(applied.dnaRecord.id),
          'Revision: '+String(applied.dnaRecord.revisionNumber ?? 'unknown'),
          'Parent DNA Record: '+String(applied.dnaRecord.parentDnaRecordId ?? 'unknown'),
          'Proposal status: '+String(applied.status ?? 'applied'),
          applied.reused ? 'This is the existing result of an earlier successful application.' : 'A new immutable DNA revision was created.',
          'Original Asset bytes and parent DNA revision were not modified.',
          'Run a fresh DNA assessment and reconstruction test against this new revision.',
        ];
        setMessages((previous)=>[...previous,{id:makeId(),role:'assistant',content:lines.join('\\n'),status:'success'}]);
        return;
      }
      if (validateDnaChangeSet) {
        if (selectedAssets.length !== 1) throw new Error('To validate a DNA change set, select the Asset whose approved change set you want VYRA to check.');
        if (!supabase) throw new Error('Secure DNA change-set validation is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const { data: approved, error: approvedError } = await supabase
          .from('vyral_asset_dna_improvement_proposals')
          .select('id,status,created_at,change_set_sha256')
          .eq('asset_id', selectedAsset.id).eq('status','approved').not('change_set','is',null)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (approvedError) throw new Error('Could not load the prepared DNA change set: ' + approvedError.message);
        if (!approved) throw new Error('No prepared DNA change set exists for this Asset. Approve its proposal and prepare the change set first.');
        const { data: validated, error: validationError } = await supabase.functions.invoke('manage-vyral-asset-dna-proposal', {
          body: { action: 'validate_change_set', proposalId: approved.id },
        });
        if (validationError) {
          let message = 'VYRA could not validate the DNA change set.';
          try { const payload = await (validationError as { context?: Response }).context?.clone().json() as { error?: string } | undefined; if (payload?.error) message = payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        const report = validated?.report;
        if (!report) throw new Error('The deterministic validation response was incomplete.');
        const lines = [
          'DNA Change Set deterministic validation complete.',
          'Result: ' + String(validated.status ?? report.status ?? 'unknown'),
          'Validator: v' + String(report.validatorVersion ?? 'unknown'),
          'SHA-256: ' + String(report.changeSetSha256 ?? approved.change_set_sha256),
          'Checks: ' + Object.entries(report.checks ?? {}).map(([key, value]) => key + '=' + String(value)).join(', '),
          'Validated operations: ' + String(report.validatedOperationCount ?? 0),
          ...(Array.isArray(report.evidenceResolution) && report.evidenceResolution.length
            ? ['Creator evidence:', ...report.evidenceResolution.map((item: any) =>
                '- ' + String(item.status) + ' · ' + String(item.reference) + ' · ' + String(item.reason))]
            : ['Creator evidence: none resolved']),
          ...(Array.isArray(report.errors) && report.errors.length ? ['Findings:', ...report.errors.map((item: unknown) => '- ' + String(item))] : []),
          'DNA changed: No. No revision was created.',
          validated.nextStep ?? 'A separate revision-creation step is required; validation alone never applies a change.',
        ];
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: lines.join('\\n'), status: report.status === 'validated' ? 'success' : 'preview' }]);
        return;
      }
      if (prepareDnaChangeSet) {
        if (selectedAssets.length !== 1) throw new Error('To prepare the DNA change set, select the same Asset whose improvement proposal you approved.');
        if (!supabase) throw new Error('Secure DNA change-set preparation is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const { data: approved, error: approvedError } = await supabase
          .from('vyral_asset_dna_improvement_proposals')
          .select('id,status,created_at')
          .eq('asset_id', selectedAsset.id).eq('status','approved')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (approvedError) throw new Error('Could not load the approved DNA proposal: ' + approvedError.message);
        if (!approved) throw new Error('No approved DNA improvement proposal exists for this Asset yet. Approve the proposal first.');
        const { data: prepared, error: prepareError } = await supabase.functions.invoke('manage-vyral-asset-dna-proposal', {
          body: { action: 'prepare_change_set', proposalId: approved.id },
        });
        if (prepareError) {
          let message = 'VYRA could not prepare the DNA change set.';
          try { const payload = await (prepareError as { context?: Response }).context?.clone().json() as { error?: string } | undefined; if (payload?.error) message = payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        const changeSet = prepared?.changeSet;
        if (!changeSet) throw new Error('The DNA change-set response was incomplete.');
        const report = [
          'DNA Change Set prepared and hash-pinned.',
          'Status: ' + String(prepared.status ?? 'unknown'),
          'SHA-256: ' + String(prepared.sha256 ?? 'not returned'),
          'Remediation tasks: ' + String(Array.isArray(changeSet.tasks) ? changeSet.tasks.length : 0),
          'Executable DNA operations: ' + String(Array.isArray(changeSet.operations) ? changeSet.operations.length : 0),
          'DNA changed: No.',
          'This change set is blocked because the current assessment contains remediation/evidence tasks but no justified before/after DNA values. VYRA will not invent a patch or create an empty DNA revision. The next step is to collect the required evidence and generate a validated, exact patch.',
        ].join('\\n');
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: report, status: 'preview' }]);
        return;
      }
      if (proposalAction) {
        if (selectedAssets.length !== 1) throw new Error('To approve or reject a DNA improvement plan, select the same Asset and send “Approve” or “Reject”.');
        if (!supabase) throw new Error('Secure DNA proposal review is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const { data: pending, error: pendingError } = await supabase
          .from('vyral_asset_dna_improvement_proposals')
          .select('id,status,created_at')
          .eq('asset_id', selectedAsset.id).eq('status','proposed')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (pendingError) throw new Error('Could not load the pending DNA improvement proposal: ' + pendingError.message);
        if (!pending) throw new Error('There is no pending DNA improvement proposal for this Asset. Run a fresh DNA assessment first.');
        const { data: review, error: reviewError } = await supabase.functions.invoke('manage-vyral-asset-dna-proposal', {
          body: { action: proposalAction, proposalId: pending.id },
        });
        if (reviewError) {
          let message = 'VYRA could not save this proposal review.';
          try { const payload = await (reviewError as { context?: Response }).context?.clone().json() as { error?: string } | undefined; if (payload?.error) message = payload.error; } catch { /* safe fallback */ }
          throw new Error(message);
        }
        const result = review?.proposal;
        const report = proposalAction === 'approve'
          ? 'DNA improvement proposal approved. The approved plan is saved against the exact Asset Version and DNA snapshot. Canonical DNA has NOT been changed. The next step is to prepare and validate the proposed changes, then create a separate immutable DNA version.'
          : 'DNA improvement proposal rejected. Canonical DNA remains unchanged.';
        setMessages((previous) => [...previous, { id: makeId(), role: 'assistant', content: report + '\nProposal: ' + (result?.id ?? pending.id) + '\nStatus: ' + (result?.status ?? proposalAction), status: 'success' }]);
        return;
      }
      if (requestsAssetDnaAssessment) {
        if (selectedAssets.length !== 1) {
          throw new Error('To assess Asset DNA, select exactly one Asset in My Vyrals or My Media Library, then ask VYRA AI Chat to check its DNA.');
        }
        if (!supabase) throw new Error('Secure Asset DNA assessment is unavailable in this environment.');
        const selectedAsset = selectedAssets[0];
        const { data, error } = await supabase.functions.invoke('assess-vyral-asset-dna', {
          body: { assetId: selectedAsset.id },
        });
        if (error) {
          let message = 'VYRA could not assess this Asset DNA.';
          try {
            const payload = await (error as { context?: Response }).context?.clone().json() as { error?: string } | undefined;
            if (payload?.error) message = payload.error;
          } catch {
            // Keep the safe generic message when the function response is unavailable.
          }
          throw new Error(message);
        }
        const assessment = data?.assessment as {
          assessmentVersion: number;
          identity: { assetId: string; assetVersionId: string; dnaRecordId: string; sourceSha256: string };
          status?: 'ready' | 'partial' | 'blocked';
          recoveryLevel?: string;
          checks?: {
            sourceBinding?: string;
            sourceFileIntegrity?: string;
            schemaValidity?: string;
            provenance?: string;
            knowledge?: string;
            payloadIntegrity?: string;
            exactReconstruction?: string;
          };
          blockers?: string[];
          limitations?: string[];
          semanticCompleteness?: {
            profile: string;
            status: 'complete' | 'partial' | 'blocked' | 'unsupported';
            requiredFieldCount: number;
            verifiedFieldCount: number;
            provisionalFieldCount: number;
            missingFieldCount: number;
            coveragePercent: number;
            fields: Array<{ key: string; status: string; evidenceRefs: string[] }>;
            limitations: string[];
          };
        } | undefined;
        if (!assessment) throw new Error('The Asset DNA assessment response was incomplete.');
        let proposalStatus = 'not saved';
        let proposalId = '';
        if (data.assessmentId) {
          const { data: proposalData, error: proposalError } = await supabase.functions.invoke('manage-vyral-asset-dna-proposal', {
            body: { action: 'create', assessmentId: data.assessmentId },
          });
          if (!proposalError && proposalData?.proposal?.id) {
            proposalId = String(proposalData.proposal.id);
            proposalStatus = String(proposalData.proposal.status ?? 'proposed');
          }
        }
        const improvementPlan = buildVyralDnaImprovementPlanV1({
          assessmentVersion: assessment.assessmentVersion,
          identity: assessment.identity,
          blockers: assessment.blockers ?? [],
          limitations: assessment.limitations ?? [],
        });
        const statusLabel = assessment.status === 'ready' ? 'READY'
          : assessment.status === 'blocked' ? 'BLOCKED' : 'PARTIAL';
        const report = [
          `Asset DNA assessment — ${selectedAsset.name}`,
          `Status: ${statusLabel}`,
          `Recovery capability: ${assessment.recoveryLevel ?? 'unknown'}`,
          'Evidence checks:',
          `• Source identity: ${assessment.checks?.sourceBinding ?? 'not available'}`,
          `• Original file bytes (Storage SHA-256): ${assessment.checks?.sourceFileIntegrity ?? 'not available'}`,
          `• DNA schema: ${assessment.checks?.schemaValidity ?? 'not available'}`,
          `• Provenance: ${assessment.checks?.provenance ?? 'not available'}`,
          `• Structured knowledge: ${assessment.checks?.knowledge ?? 'not available'}`,
          `• Stored payload integrity: ${assessment.checks?.payloadIntegrity ?? 'not available'}`,
          `• Exact reconstruction test: ${assessment.checks?.exactReconstruction ?? 'not available'}`,
          ...(assessment.semanticCompleteness ? [
            '',
            'Semantic DNA completeness:',
            `• Profile: ${assessment.semanticCompleteness.profile}`,
            `• Status: ${assessment.semanticCompleteness.status.toUpperCase()}`,
            `• Trusted coverage: ${assessment.semanticCompleteness.coveragePercent}% (${assessment.semanticCompleteness.verifiedFieldCount}/${assessment.semanticCompleteness.requiredFieldCount})`,
            `• AI-only provisional fields: ${assessment.semanticCompleteness.provisionalFieldCount}`,
            `• Missing fields: ${assessment.semanticCompleteness.missingFieldCount}`,
            ...assessment.semanticCompleteness.fields.map((item) => `• ${item.key}: ${item.status}`),
            ...assessment.semanticCompleteness.limitations.map((item) => `  Note: ${item}`),
          ] : []),
          ...(assessment.blockers?.length ? ['Blockers:', ...assessment.blockers.map((item) => `• ${item}`)] : []),
          ...(assessment.limitations?.length ? ['Limitations:', ...assessment.limitations.map((item) => `• ${item}`)] : []),
          ...(improvementPlan.improvements.length ? ['', 'Evidence-backed improvement plan:', ...improvementPlan.improvements.map((item) => `• [${item.priority.toUpperCase()}] ${item.action} Acceptance: ${item.acceptanceEvidence}`)] : []),
          ...(improvementPlan.unmappedBlockers.length ? ['', 'Unmapped blockers — engineering review required:', ...improvementPlan.unmappedBlockers.map((item) => '• ' + item)] : []),
          ...(improvementPlan.informational.length ? ['', 'Additional improvements:', ...improvementPlan.informational.map((item) => '• ' + item)] : []),
          '',
          ...improvementPlan.safety.map((item) => '• ' + item),
          '',
          'This result evaluates only the selected Asset Version and its DNA record. It is not the Vyral collection quality grade. Decoded-sample exactness does not mean the original encoded file bytes can be recovered.',
          `Assessment history ID: ${data.assessmentId ?? 'not returned'}`,
          `Improvement proposal: ${proposalId || proposalStatus}`,
          ...(proposalId && proposalStatus === 'proposed' ? ['To approve this plan, select this same Asset and send “Approve”. To reject it, send “Reject”. Approval does not change DNA; it authorizes the next reviewed version-creation step.'] : []),
        ].join('\n');
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: report,
          status: assessment.status === 'ready' ? 'success' : 'preview',
        }]);
        return;
      }
      if (requestsVyralReconstructionHistory) {
        if (qualityVyralIds.length !== 1) {
          throw new Error('To inspect reconstruction attempts, select an Asset from one Vyral or attach that Vyral’s .vyral package in AI Chat first.');
        }
        if (!supabase) throw new Error('Secure reconstruction evidence is unavailable in this environment.');
        const { data, error } = await supabase
          .from('vyral_reconstruction_tests')
          .select('id,asset_id,model_provider,model_id,model_version,prompt_sha256,session_reference,tool_access,blindness_status,attempt_evidence,protocol_version,comparison_mode,test_status,exact_match,similarity_score,created_at')
          .eq('vyral_id', qualityVyralIds[0])
          .eq('protocol_version', 'ORIGIN-01-v3')
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw new Error('Could not load saved reconstruction evidence: ' + error.message);
        const attempts = (data ?? []) as Array<{
          id: string; asset_id: string; model_provider: string; model_id: string; model_version: string | null;
          prompt_sha256: string | null; session_reference: string | null; tool_access: Record<string, unknown>;
          blindness_status: string; attempt_evidence: Record<string, unknown>; protocol_version: string;
          comparison_mode: string; test_status: string; exact_match: boolean | null;
          similarity_score: number | null; created_at: string;
        }>;
        const evidenceSummary = summarizeVyralReconstructionEvidenceV1(attempts);
        const report = attempts.length ? [
          `Vyral DNA-only reconstruction evidence — ${evidenceSummary.totalAttempts} saved attempt(s)`,
          `Exact decoded-pixel matches: ${evidenceSummary.exactMatches}/${evidenceSummary.totalAttempts}`,
          `Best recorded RGB similarity (not an exact pass): ${evidenceSummary.bestSimilarity === null ? 'not available' : (evidenceSummary.bestSimilarity * 100).toFixed(2) + '%'}`,
          `Evidence gaps: ${evidenceSummary.evidenceGaps.length ? evidenceSummary.evidenceGaps.join(', ') : 'none detected in recorded fields'}`,
          `Different outputs: ${attempts.filter((item) => item.test_status === 'failed').length}`,
          `Inconclusive: ${attempts.filter((item) => item.test_status === 'inconclusive').length}`,
          '',
          ...attempts.map((item, index) => {
            const evidence = item.attempt_evidence && typeof item.attempt_evidence === 'object' ? item.attempt_evidence : {};
            const blindness = evidence.blindness && typeof evidence.blindness === 'object'
              ? evidence.blindness as Record<string, unknown> : {};
            const modelVersion = item.model_version ?? (typeof evidence.modelVersion === 'string' ? evidence.modelVersion : 'not recorded');
            const promptHash = item.prompt_sha256 ?? (typeof evidence.promptSha256 === 'string' ? evidence.promptSha256 : null);
            const result = item.exact_match === true ? 'EXACT DECODED-PIXEL MATCH'
              : item.test_status === 'inconclusive' ? 'INCONCLUSIVE'
              : item.test_status.toUpperCase();
            const similarity = typeof item.similarity_score === 'number'
              ? (item.similarity_score * 100).toFixed(2) + '%' : 'not available';
            const date = item.created_at && Number.isFinite(Date.parse(item.created_at))
              ? new Date(item.created_at).toLocaleString() : 'date unavailable';
            const toolNames = Object.keys(item.tool_access ?? {}).join(', ') || 'not recorded';
            return [
              `${index + 1}. ${item.model_provider} / ${item.model_id} (${modelVersion})`,
              `   Result: ${result} · RGB similarity: ${similarity} · ${date}`,
              `   Blindness evidence: ${item.blindness_status ?? 'unverified'}`,
              `   Prompt SHA-256: ${promptHash ? promptHash.slice(0, 16) + '…' : 'not recorded'} · Tool access: ${toolNames}`,
              item.session_reference ? `   External session reference: ${item.session_reference}` : '',
              blindness.independentlyVerified === false ? '   Note: original-file isolation is creator-attested, not independently audited.' : '',
            ].filter(Boolean).join('\n');
          }),
          '',
          'Interpretation rules:',
          '• Exact success requires identical decoded RGB pixels at identical dimensions.',
          '• RGB similarity is a separate metric; a high score is not an exact match.',
          '• Creator-attested blindness does not prove the external model never saw the original. No attempt is independently blind-verified unless separate audit evidence exists.',
          '• Missing model version, prompt hash or tool-access details remain missing evidence; they are not inferred.',
          '• These records compare reconstruction outputs. They do not automatically modify DNA records.',
          '',
          'Evidence-guided next actions:',
          ...evidenceSummary.nextActions.map((item) => '• ' + item),
        ].join('\n') : 'No ORIGIN-01 v3 reconstruction attempts are saved for this Vyral yet. Existing earlier protocol records are not silently upgraded to v3 evidence.';
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: report,
          status: attempts.length ? 'success' : 'preview',
        }]);
        return;
      }
      if (requestsVyralQualityHistory) {
        if (qualityVyralIds.length !== 1) {
          throw new Error('To view quality history, select Assets from one Vyral or attach that Vyral’s .vyral package in AI Chat first.');
        }
        if (!supabase) throw new Error('Secure Vyral quality history is unavailable in this environment.');
        const { data, error } = await supabase.functions.invoke('get-vyral-quality-history', {
          body: { vyralId: qualityVyralIds[0] },
        });
        if (error) {
          let message = 'VYRA could not load this Vyral’s quality history.';
          try {
            const payload = await (error as { context?: Response }).context?.clone().json() as { error?: string } | undefined;
            if (payload?.error) message = payload.error;
          } catch {
            // Keep the safe generic message when the function response is unavailable.
          }
          throw new Error(message);
        }
        const history = Array.isArray(data?.history) ? data.history as Array<{
          id: string;
          createdAt: string;
          snapshotRevision: number;
          standardId: string;
          standardVersion: number;
          status: string;
          score: number | null;
          grade: string | null;
        }> : [];
        const report = history.length
          ? [
              `Vyral quality history — latest ${history.length} evaluation(s)`,
              ...history.map((item, index) => {
                const date = item.createdAt && Number.isFinite(Date.parse(item.createdAt))
                  ? new Date(item.createdAt).toLocaleString()
                  : 'Date unavailable';
                const result = item.status === 'graded'
                  ? `${item.grade ?? '—'} (${item.score ?? '—'}/100)`
                  : `${String(item.status).toUpperCase()} — no grade issued`;
                return `${index + 1}. ${date} · ${result} · snapshot r${item.snapshotRevision} · standard ${item.standardId} v${item.standardVersion}`;
              }),
              '',
              'History is ordered newest first. Each result is tied to its own immutable snapshot and versioned standard.',
            ].join('\n')
          : 'No saved quality evaluations exist for this Vyral yet. Ask VYRA AI Chat to evaluate its quality after an approved standard is published.';
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: report,
          status: 'success',
        }]);
        return;
      }
      if (requestsVyralQuality) {
        if (qualityVyralIds.length !== 1) {
          throw new Error('To evaluate quality, select Assets from one Vyral or attach that Vyral’s .vyral package in AI Chat first.');
        }
        if (!supabase) throw new Error('Secure Vyral quality evaluation is unavailable in this environment.');
        const { data, error } = await supabase.functions.invoke('evaluate-vyral-quality', {
          body: { vyralId: qualityVyralIds[0] },
        });
        if (error) {
          let message = 'VYRA could not complete the quality evaluation.';
          try {
            const payload = await (error as { context?: Response }).context?.clone().json() as { error?: string } | undefined;
            if (payload?.error) message = payload.error;
          } catch {
            // Keep the safe generic message when the function response is unavailable.
          }
          throw new Error(message);
        }
        const evaluation = data?.evaluation as {
          status?: 'graded' | 'incomplete_evidence' | 'blocked';
          grade?: string | null;
          score?: number | null;
          hardGateFailures?: string[];
          missingApplicableEvidence?: string[];
          rules?: Array<{ title: string; status: string; recommendation?: string | null }>;
        } | undefined;
        if (!evaluation) throw new Error('The quality evaluation response was incomplete.');
        const report = [
          evaluation.status === 'graded'
            ? `Vyral quality: ${evaluation.grade ?? '—'} (${evaluation.score ?? '—'}/100)`
            : evaluation.status === 'blocked'
              ? 'Vyral quality evaluation: BLOCKED — no grade issued.'
              : 'Vyral quality evaluation: INCOMPLETE — no grade issued.',
          `Snapshot revision: ${data.snapshot?.revision ?? 'unknown'}`,
          `Standard: ${data.evaluation?.standard?.name ?? 'versioned standard'} v${data.evaluation?.standard?.version ?? '?'}`,
          ...(evaluation.hardGateFailures?.length ? [`Hard-gate failures: ${evaluation.hardGateFailures.join(', ')}`] : []),
          ...(evaluation.missingApplicableEvidence?.length ? [`Evidence still needed: ${evaluation.missingApplicableEvidence.join(', ')}`] : []),
          ...(evaluation.rules ?? []).filter((rule) => rule.recommendation).map((rule) => `• ${rule.title}: ${rule.recommendation}`),
          '',
          'This grade reflects only the pinned snapshot, selected standard and verified evidence available at evaluation time. It does not guarantee identical results across external AI models.',
        ].join('\n');
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: report,
          status: evaluation.status === 'graded' ? 'success' : 'preview',
        }]);
        return;
      }
      if (selectedAssets.length) {
        if (!supabase) throw new Error('Secure Asset access is unavailable in this environment.');
        const uniqueVyrals = [...new Set(selectedAssets.map((asset) => asset.vyralId))];
        const { data: assetRows, error: assetError } = await supabase.from('vyral_assets').select('id,vyral_id,name,mime_type,storage_path,license_override,metadata').in('id', selectedAssets.map((asset) => asset.id));
        if (assetError) throw new Error('Could not verify selected Asset access: ' + assetError.message);
        if ((assetRows ?? []).length !== selectedAssets.length) throw new Error('One or more selected Assets are no longer accessible. Please select them again.');
        if ((assetRows ?? []).some((asset) => !selectedAssets.some((selected) => selected.id === asset.id && selected.vyralId === asset.vyral_id))) throw new Error('A selected Asset no longer belongs to its declared Vyral.');
        const { data: parentVyrals, error: vyralError } = await supabase.from('vyrals').select('id,license_policy').in('id', uniqueVyrals);
        if (vyralError) throw new Error('Could not verify Vyral permissions: ' + vyralError.message);
        if ((parentVyrals ?? []).length !== uniqueVyrals.length) throw new Error('One or more selected Vyrals are no longer accessible.');
        if ((parentVyrals ?? []).some((item) => (item.license_policy as Record<string, unknown> | null)?.allow_ai_analysis === false)) throw new Error('AI analysis is not permitted by one of the selected Vyrals.');

        // Resolve immutable latest versions instead of trusting the Asset row's legacy storage_path.
        const selectedIds = (assetRows ?? []).map((asset) => asset.id);
        const { data: versionRows, error: versionError } = await supabase
          .from('vyral_asset_versions')
          .select('id,asset_id,vyral_id,storage_path,mime_type,size_bytes,version_number')
          .in('asset_id', selectedIds)
          .order('version_number', { ascending: false });
        if (versionError) throw new Error('Could not resolve current selected Asset versions: ' + versionError.message);
        const latestVersionByAsset = new Map<string, { vyral_id: string; storage_path: string; mime_type: string | null; size_bytes: number; version_number: number }>();
        for (const version of versionRows ?? []) {
          if (!latestVersionByAsset.has(version.asset_id)) latestVersionByAsset.set(version.asset_id, version);
        }
        if (selectedIds.some((id) => !latestVersionByAsset.has(id))) throw new Error('A selected Asset has no available source version. Please refresh the Vyral and select it again.');

        for (const asset of assetRows ?? []) {
          const license = asset.license_override && typeof asset.license_override === 'object' ? asset.license_override as Record<string, unknown> : {};
          if (license.allow_ai_analysis === false) throw new Error('AI analysis is not permitted for selected Asset: ' + asset.name);
          const version = latestVersionByAsset.get(asset.id)!;
          if (version.vyral_id !== asset.vyral_id) throw new Error('A selected Asset version no longer belongs to its Vyral: ' + asset.name);
          const mimeType = String(version.mime_type || asset.mime_type || '').toLowerCase();
          const filename = String(asset.name || '').toLowerCase();
          const extension = filename.split('.').pop() || '';
          const isTextLike = mimeType.startsWith('text/') ||
            ['application/json', 'application/xml', 'application/x-ndjson'].includes(mimeType) ||
            /\.(txt|md|csv|json|xml|log)$/i.test(filename);
          const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
          const audioMime = (mimeType === 'audio/mp3' || mimeType === 'audio/x-mp3') ? 'audio/mpeg'
            : mimeType === 'audio/x-wav' ? 'audio/wav'
              : mimeType === 'audio/x-flac' ? 'audio/flac'
                : mimeType.startsWith('audio/') ? mimeType
                  : ({ mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac' } as Record<string, string>)[extension] ?? mimeType;
          const isAudio = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'].includes(audioMime) ||
            ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(extension);
          const isVideo = mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(extension);
          const needsSource = mimeType.startsWith('image/') || isTextLike || isPdf || isAudio || isVideo;
          if (!needsSource) continue;
          const sourceLimit = isPdf || isAudio ? 2 * 1024 * 1024 : 20 * 1024 * 1024;
          if (Number(version.size_bytes) > sourceLimit) throw new Error(`Selected Asset exceeds the ${isPdf || isAudio ? '2 MB document/audio' : '20 MB media'} inspection limit: ${asset.name}`);
          const { data: signed, error: signedError } = await supabase.storage.from('vyral-assets').createSignedUrl(version.storage_path, 60);
          if (signedError || !signed?.signedUrl) throw new Error('Could not securely open the current version of selected Asset: ' + asset.name);
          const response = await fetch(signed.signedUrl);
          if (!response.ok) throw new Error('Could not load the current version of selected Asset: ' + asset.name);
          const blob = await response.blob();
          if (blob.size > sourceLimit) throw new Error('Selected Asset exceeds its safe inspection limit: ' + asset.name);
          if (mimeType.startsWith('image/')) {
            if (visionImages.length < 4) {
              const preview = await createSelectedAssetVisionPreview(blob);
              visionImages.push({ ...preview, assetId: asset.id, assetName: asset.name });
            }
          } else if (isTextLike) {
            const decoded = new TextDecoder('utf-8', { fatal: false }).decode(await blob.arrayBuffer());
            const bounded = decoded.slice(0, 24000);
            const marker = decoded.length > bounded.length ? '\n[Content truncated for safety]' : '';
            const currentMessage = nextMessages[nextMessages.length - 1];
            currentMessage.content += `\n\nSelected Asset content — ${asset.name} (current version ${version.version_number}):\n${bounded}${marker}`;
          } else if (isPdf || isAudio) {
            if (mediaFiles.length >= 4) throw new Error('Select no more than four PDF/audio files for one AI request.');
            const mediaMime = isPdf ? 'application/pdf' : audioMime;
            if (!['application/pdf', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/aac'].includes(mediaMime)) {
              throw new Error('This audio format is not supported for direct AI inspection: ' + asset.name);
            }
            mediaFiles.push({
              mimeType: mediaMime as typeof mediaFiles[number]['mimeType'],
              data: await readBlobAsBase64(blob),
              assetId: asset.id,
              assetName: asset.name,
            });
            const currentMessage = nextMessages[nextMessages.length - 1];
            currentMessage.content += `\n\nAttached source for direct AI inspection: ${asset.name} (${isPdf ? 'PDF document' : 'audio'}; current version ${version.version_number}).`;
          } else if (isVideo) {
            const remaining = Math.max(0, 4 - visionImages.length);
            const frames = await extractSelectedVideoFrames(blob, asset.id, asset.name, remaining);
            visionImages.push(...frames);
            const currentMessage = nextMessages[nextMessages.length - 1];
            currentMessage.content += `\n\nVideo frames attached for visual inspection: ${asset.name}; ${frames.length} sampled frames from the current version (${version.version_number}). Audio track transcription is not included.`;
          }
        }
      }
      const accessToken = await getCurrentAccessToken();
      const canStreamText = visionImages.length === 0 && mediaFiles.length === 0;
      if (canStreamText) {
        streamingAssistantId = makeId();
        setMessages((previous) => [...previous, {
          id: streamingAssistantId!,
          role: 'assistant',
          content: '',
        }]);
      }
      const result = await aiService.generateResponse({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        ...(accessToken ? { accessToken } : {}),
        idempotencyKey: 'chat-' + makeId(),
        ...(canStreamText ? {
          onTextDelta: (chunk: string) => {
            const messageId = streamingAssistantId;
            if (!messageId) return;
            streamedText += chunk;
            setMessages((previous) => previous.map((message) => message.id === messageId
              ? { ...message, content: message.content + chunk }
              : message));
          },
        } : {}),
        ...(visionImages.length ? { visionImages: visionImages.map(({ mimeType, data, assetId, assetName }) => ({ mimeType, data, assetId, assetName })) } : {}),
        ...(mediaFiles.length ? { mediaFiles } : {}),
      });
      const completedMessage: ChatMessage = {
        id: streamingAssistantId ?? makeId(),
        role: 'assistant',
        content: result.status === 'error' && streamedText
          ? streamedText + '\n\n' + result.content
          : result.content,
        status: result.status,
        providerLabel: [result.providerName, result.modelName].filter(Boolean).join(' · '),
      };
      if (streamingAssistantId) {
        const messageId = streamingAssistantId;
        setMessages((previous) => previous.map((message) => message.id === messageId ? completedMessage : message));
      } else {
        setMessages((previous) => [...previous, completedMessage]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VYRA AI could not complete this request. Please try again.';
      if (streamingAssistantId) {
        const messageId = streamingAssistantId;
        setMessages((previous) => previous.map((item) => item.id === messageId
          ? { ...item, content: item.content ? item.content + '\n\n' + message : message, status: 'error' }
          : item));
      } else {
        const pendingUpdateDraft = [...messages].reverse().find((item) => item.role === 'assistant' && item.action?.type === 'storyboard-update-draft')?.action;
        const retryDraftAction = isStoryboardUpdateConfirmation(text) && pendingUpdateDraft
          ? pendingUpdateDraft
          : isStoryboardCreateConfirmation(text)
            ? [...messages].reverse().find((item) => item.role === 'assistant' && item.action?.type === 'storyboard-create-draft')?.action
            : undefined;
        setMessages((previous) => [...previous, {
          id: makeId(),
          role: 'assistant',
          content: message,
          status: 'error',
          ...(retryDraftAction ? { action: retryDraftAction } : {}),
        }]);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelection = async (file: File | null) => {
    setSelectedFile(file);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    if (!file) {
      setSelectedFileStatus(null);
      return;
    }
    if (file.name.toLowerCase().endsWith('.vyral')) {
      setSelectedFileStatus('Checking Vyral DNA…');
      try {
        const inspection = await inspectVyralAttachment(file);
        setSelectedVyralContext(inspection.context);
        setSelectedVyralId(inspection.vyralId);
        setSelectedVyralImages(inspection.visionImages);
        setSelectedFileStatus(inspection.visionImages.length ? `Vyral package validated · DNA v3 checked · ${inspection.visionImages.length} AI Vision previews ready` : 'Vyral package validated · DNA v3 checked locally · no visual DNA preview found');
      } catch (error) {
        setSelectedFileStatus(error instanceof Error ? error.message : 'Could not validate this Vyral package.');
      }
      return;
    }
    setSelectedFileStatus('File metadata only · full content parsing is not available for this file type yet');
  };

  const shareCurrentChat = async () => {
    const transcript = messages.map((message) => `${message.role === 'user' ? 'You' : 'VYRA AI'}: ${message.content}`).join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VYRA AI Chat', text: transcript });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transcript);
      }
    } catch {
      // The user may cancel the native share sheet.
    }
    setActionsOpen(false);
  };

  const archiveCurrentChat = async () => {
    await saveCurrentSession(true);
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const deleteCurrentChat = async () => {
    if (activeSessionId && supabase && historyOwnerId) {
      const { error } = await supabase.from('vyra_ai_chat_conversations')
        .delete().eq('id', activeSessionId).eq('user_id', historyOwnerId);
      if (error) {
        setHistoryError('This conversation could not be deleted. Please try again.');
        return;
      }
    }
    if (activeSessionId) {
      setSessions((previous) => previous.filter((session) => session.id !== activeSessionId));
    }
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralId(null);
    setSelectedVyralImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const toggleLock = () => {
    setIsLocked((previous) => !previous);
    setActionsOpen(false);
  };

  const handleCopy = (content: string) => {
    if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(content);
  };

  return (
    <main className="fixed inset-x-0 top-[calc(var(--vyra-visual-viewport-top,0px)+109px)] bottom-[var(--vyra-visual-viewport-bottom-gap,0px)] mx-auto min-h-0 w-full max-w-[var(--vyra-content-width)] overflow-hidden px-3 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+64px)] sm:px-6">
      <header className="fixed right-3 top-[calc(var(--vyra-visual-viewport-top,0px)+112px)] z-[60] flex items-start justify-end sm:right-6 sm:top-[calc(var(--vyra-visual-viewport-top,0px)+76px)]">
        <div
          className="relative overflow-hidden border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-primary)]"
          style={{
            width: actionsOpen ? 208 : 40,
            height: actionsOpen ? 304 : 40,
            borderRadius: actionsOpen ? '16px' : '50%',
            transition: 'width 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 300ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className={`absolute right-0 top-0 z-10 size-10 rounded-full px-0 text-[var(--vyra-text-primary)] ${actionsOpen ? 'bg-transparent hover:bg-[var(--vyra-bg-hover)]' : 'bg-[var(--vyra-bg-surface)] hover:bg-[var(--vyra-bg-hover)]'}`}
            aria-label={actionsOpen ? 'Close chat menu' : 'Open chat menu'}
            title="Chat menu"
            onClick={() => setActionsOpen((open) => !open)}
          >
            {actionsOpen ? <X size={20} /> : <MoreHorizontal size={23} />}
          </Button>
          <div
            aria-hidden={!actionsOpen}
            className={`absolute inset-x-0 bottom-0 top-10 p-1.5 pt-1 text-[var(--vyra-text-primary)] transition-opacity duration-200 ${actionsOpen ? 'opacity-100 delay-100' : 'pointer-events-none opacity-0'}`}
          >
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={() => { setHistoryOpen(true); setActionsOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <History size={14} /> Recent chats
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} onClick={startNewChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)]">
              <Plus size={14} /> New chat
            </button>
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={shareCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Share2 size={14} /> Share chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={archiveCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Archive size={14} /> Archive chat
            </button>
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={toggleLock} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {isLocked ? 'Unlock chat' : 'Lock chat'}
            </button>
            <div className="my-1 border-t border-[var(--vyra-border-subtle)]" />
            <button type="button" tabIndex={actionsOpen ? 0 : -1} disabled={!hasMessages} onClick={deleteCurrentChat} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-[var(--vyra-danger)] transition-colors hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 size={14} /> Delete chat
            </button>
          </div>
        </div>
      </header>

      <section className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth [scrollbar-gutter:stable]">
        {!hasMessages ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 pb-32 pt-20 text-center">
            <div className="mb-5 grid size-14 place-items-center rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-accent-primary)] shadow-lg shadow-cyan-950/10">
              <MessageSquare size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--vyra-text-primary)] sm:text-2xl">Hello! What would you like to create today?</h1>
            <p className="mt-2 max-w-md text-xs leading-5 text-[var(--vyra-text-secondary)] sm:text-sm">
              Explore ideas, write scripts, plan projects, or ask me anything — about VYRA or beyond.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5 px-1 pb-36 pt-20">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`min-w-0 max-w-[88%] break-words rounded-2xl px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere] ${message.role === 'user' ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-text-primary)]' : 'border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] text-[var(--vyra-text-secondary)]'}`}>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
                  {message.role === 'assistant' && message.providerLabel && <p className="mt-2 text-[10px] text-[var(--vyra-text-muted)]">{message.providerLabel}</p>}
                  {message.role === 'assistant' && message.status === 'preview' && <p className="mt-1 text-[10px] text-[var(--vyra-text-muted)]">Preview response · no live model was confirmed</p>}
                  {message.role === 'assistant' && message.status === 'error' && (() => {
                    const previousUserMessage = messages.slice(0, messages.indexOf(message)).reverse().find((item) => item.role === 'user');
                    const canRetry = previousUserMessage && !/Attached file:|Selected VYRA Assets/.test(previousUserMessage.content);
                    return canRetry ? <button type="button" onClick={() => { void sendMessage(previousUserMessage.content); }} disabled={isSending} className="mt-2 mr-3 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)] disabled:opacity-40">Retry</button> : null;
                  })()}
                  {message.role === 'assistant' && <button type="button" onClick={() => handleCopy(message.content)} className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--vyra-text-muted)] hover:text-[var(--vyra-text-primary)]"><Copy size={12} /> Copy</button>}
                </div>
              </div>
            ))}
            {isSending && <p className="text-center text-xs text-[var(--vyra-text-muted)]">VYRA AI is preparing a response…</p>}
          </div>
        )}
      </section>

      <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-[var(--vyra-content-width)] p-0 sm:inset-x-6 sm:bottom-4">
        {isLocked && (
          <p className="mb-2 text-center text-[11px] text-[var(--vyra-text-muted)]">ဒီ Chat ကို Lock လုပ်ထားပါတယ်။ စာပို့ရန် Unlock လုပ်ပါ။</p>
        )}
        <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-2">
          {selectedAssets.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5 px-1" aria-label="Selected VYRA Assets">{selectedAssets.map((asset) => <span key={asset.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/10 px-2 py-1 text-[10px] text-[var(--vyra-text-primary)]"><span className="max-w-36 truncate">{asset.name}</span><span className="text-[var(--vyra-text-muted)]">{asset.visibility}</span><button type="button" onClick={() => { const next = selectedAssets.filter((item) => item.id !== asset.id); setSelectedAssets(next); onSelectedAssetsChange?.(next); }} aria-label={'Remove '+asset.name} className="rounded-full p-0.5 hover:bg-[var(--vyra-bg-hover)]"><X size={11}/></button></span>)}<button type="button" onClick={() => { setSelectedAssets([]); onSelectedAssetsChange?.([]); }} className="px-1 text-[10px] text-[var(--vyra-text-muted)] underline">Clear</button></div>}
          {selectedFile && (
            <div className="mb-1 flex items-center gap-2 px-2 text-[10px] text-[var(--vyra-text-muted)]">
              <span className="min-w-0 flex-1 truncate">{selectedFile.name}{selectedFileStatus ? ` · ${selectedFileStatus}` : ''}</span>
              <button type="button" onClick={() => { setSelectedFile(null); setSelectedFileStatus(null); setSelectedVyralContext(null);
    setSelectedVyralId(null); setSelectedVyralImages([]); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Remove attachment" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--vyra-bg-hover)]">
                <X size={13} />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.vyral,application/vnd.vyra.vyral+zip,application/zip"
            onChange={(event) => { void handleFileSelection(event.target.files?.[0] ?? null); }}
          />
          <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-end gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLocked}
              aria-label="Upload file"
              title="Upload file"
              className={`col-start-1 grid size-9 place-items-center rounded-full text-[var(--vyra-text-muted)] transition-colors hover:bg-[var(--vyra-bg-hover)] hover:text-[var(--vyra-text-primary)] active:bg-transparent disabled:opacity-40 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 [-webkit-tap-highlight-color:transparent] ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
            >
              <Plus size={21} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }}
              rows={1}
              disabled={isLocked}
              placeholder={isLocked ? 'Chat locked' : isSending ? 'VYRA AI is thinking…' : 'Message VYRA AI…'}
              aria-label="Message VYRA AI"
              style={{ outline: "none", boxShadow: "none", WebkitTapHighlightColor: "transparent", WebkitAppearance: "none" }}
              className={`col-start-2 row-start-1 w-full max-h-36 min-h-10 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-sm leading-6 text-[var(--vyra-text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--vyra-text-muted)] focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0 focus:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent]`}
            />
            <Button
              type="submit"
              size="sm"
              className={`col-start-3 !size-9 !min-h-9 !min-w-9 !rounded-full !p-0 aspect-square shrink-0 focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${isMultiline ? 'row-start-2' : 'row-start-1'}`}
              disabled={(!draft.trim() && !selectedFile && !selectedAssets.length) || isLocked || isSending || Boolean(selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext)}
              aria-label="Send message"
            >
              {isSending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUp size={17} />}
            </Button>
          </div>
        </form>
      </div>

      {historyOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="chat-history-title" className="max-h-[min(80vh,620px)] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--vyra-border-subtle)] px-4 py-3.5">
              <div>
                <h2 id="chat-history-title" className="text-sm font-bold text-[var(--vyra-text-primary)]">Recent chats</h2>
                <p className="mt-0.5 text-[10px] text-[var(--vyra-text-muted)]">{historyError ?? (historyReady ? 'Your conversations' : 'Loading chat history…')}</p>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" className="grid size-8 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {!historyReady ? (
                <div className="px-5 py-12 text-center text-xs text-[var(--vyra-text-muted)]">Loading chat history…</div>
              ) : sessions.filter((session) => !session.archived).length ? sessions.filter((session) => !session.archived).map((session) => (
                <button key={session.id} type="button" onClick={() => openSession(session)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--vyra-bg-hover)]">
                  <MessageSquare size={16} className="shrink-0 text-[var(--vyra-text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--vyra-text-primary)]">{session.title}</span>
                  <span className="shrink-0 text-[10px] text-[var(--vyra-text-muted)]">{session.updatedAt}</span>
                </button>
              )) : (
                <div className="px-5 py-12 text-center">
                  <Clock3 size={23} className="mx-auto text-[var(--vyra-text-muted)]" />
                  <p className="mt-3 text-xs font-semibold text-[var(--vyra-text-primary)]">No recent chats yet</p>
                  <p className="mt-1 text-[11px] text-[var(--vyra-text-muted)]">Your conversations will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
};
