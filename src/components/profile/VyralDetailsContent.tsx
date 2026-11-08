import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Archive, Box, ChevronRight, Clock3, Dna,
  Download, File as FileIcon, FileText, Fingerprint, FlaskConical, Folder, FolderPlus, GitBranch,
  HardDrive, Image as ImageIcon, LockKeyhole, Music2, Pencil, Plus, Search, ShieldCheck, Eye, EyeOff,
  Trash2, Upload, Video, X,
} from 'lucide-react';
import { getCurrentAccessToken, supabase, useAuth } from '../../context/AuthContext';
import { createVyralAssetDnaOnlyPackage, createVyralZip, encodeVyralDnaV3PngFromPackage, getVyralPackageAssetsForImport, parseVyralManifest, readVyralZip, reconstructVyralDnaV3FromPackage, reconstructVyralFileDnaFromPackage, selectVyralPackageComponents, VYRAL_PACKAGE_FORMAT, VYRAL_PACKAGE_VERSION, type VyralExportComponents } from '../../services/vyralPackage';
import { validateVyralMasterDnaV1 } from '../../services/vyralMasterDnaV1';
import { VYRAL_SYSTEM_FILES_VERSION } from '../../services/vyralSystemFilesV1';
import { checkPublicVyralCollectionReferenceV1, downloadPublicVyralCollectionAssetV1, retrievePublicVyralAssetDnaV1, retrievePublicVyralAssetFileDnaV1, type PublicCollectionAssetReferenceV1 } from '../../services/vyralCollectionReferenceResolverV1';
import type { VyralDnaV3Record } from '../../services/vyralDnaV3';
import { createVyralFileDnaV1, type VyralFileDnaRecord } from '../../services/vyralFileDnaV1';
import { VYRAL_AI_RECONSTRUCTION_GUIDE, VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT } from '../../services/vyralPortableReconstruction';
import type { VyralChatAssetContext } from '../../types/vyralChat';
import { markVyralAiDetailsStale, mergeVyralAiDetails, setVyralAiDetailField, suggestVyralAssetDetails, suggestVyralCollectionDetails, type VyralAiDetails, type VyralDetailValue } from '../../services/vyralAiDetails';

type Vyral = {
  id: string; name: string; description: string; visibility: 'private' | 'unlisted' | 'public';
  dna_status: string; license_policy?: Record<string, unknown>; metadata?: Record<string, unknown>;
  master_dna_status?: string; master_dna_revision?: number; master_dna_purpose?: string | null; master_dna_intended_uses?: string[];
};
type FolderRow = { id: string; vyral_id: string; parent_id: string | null; name: string; created_at: string };
type AssetRow = {
  id: string; vyral_id: string; folder_id: string | null; name: string; original_filename: string;
  asset_type: string; mime_type: string; size_bytes: number; storage_path: string; sha256: string | null;
  processing_status: string; description: string; created_at: string; updated_at: string; metadata?: Record<string, unknown>;

};
type DnaRow = {
  id: string; asset_id: string | null; scope: string; schema_version: number; dna_status: string; source_kind: string;
  verification_status: string; payload: Record<string, unknown>; created_at: string;
};
type FingerprintRow = { id: string; asset_id: string; asset_version_id: string | null; fingerprint_kind: string; algorithm: string; value: string; metadata?: Record<string, unknown>; created_at: string };
type ObservationRow = { id: string; asset_id: string; asset_version_id: string; task_kind: string; model_provider: string; model_id: string; confidence: number | null; verification_status: string; observation: Record<string, unknown>; evidence?: Record<string, unknown>; source_sha256: string; created_at: string };
type LineageRow = { id: string; parent_asset_id: string; child_asset_id: string; relation_kind: string; created_at: string };
type MasterRelationshipRow = { id: string; relationship_type: string; from_kind: 'asset' | 'vyral'; from_asset_id: string | null; to_kind: 'asset' | 'vyral'; to_asset_id: string | null; rationale: string };
type MasterAssetDraft = { role: '' | 'main' | 'supporting'; purpose: string; targetAssetId: string; rationale: string };
type ReconstructionRow = { id: string; asset_id: string; asset_version_id?: string | null; dna_record_id?: string | null; model_provider: string; model_id: string; protocol_version?: string; comparison_mode: string; test_status: string; exact_match: boolean | null; similarity_score: number | null; report?: Record<string, unknown>; created_at: string };
type AssetVersionRow = { id: string; asset_id: string; storage_path: string; version_number: number; mime_type: string; size_bytes: number; sha256: string | null; source_kind?: string; parent_version_id?: string | null; metadata?: Record<string, unknown>; created_at: string };
type CollectionReferenceRow = { id: string; source_vyral_id: string; source_revision: number; source_visibility: 'public' | 'private' | 'unlisted'; resolver_uri: string | null; projection_sha256: string; compact_snapshot: Record<string, unknown>; imported_at: string };
type Tab = 'overview' | 'assets' | 'dna' | 'lineage' | 'license';
type Props = { vyral: Vyral; searchQuery: string; onVyralUpdated: (patch: Partial<Vyral>) => void; onSendAssetsToChat?: (assets: VyralChatAssetContext[]) => void };

const isProtectedVyral = (item: Vyral) => item.id === 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d' || item.metadata?.protected === true;

const formatAiFieldDraft = (value: VyralDetailValue): string => {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value === null ? '' : String(value);
};

const parseAiFieldDraft = (draft: string, previous: VyralDetailValue): VyralDetailValue => {
  if (!draft.trim()) return Array.isArray(previous) && previous.every((item) => typeof item === 'string') ? [] : null;
  if (Array.isArray(previous)) {
    if (previous.every((item) => typeof item === 'string')) return draft.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 50);
    return JSON.parse(draft) as VyralDetailValue;
  }
  if (previous !== null && typeof previous === 'object') return JSON.parse(draft) as VyralDetailValue;
  if (typeof previous === 'number') {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) throw new Error('Enter a valid number for this detail.');
    return parsed;
  }
  if (typeof previous === 'boolean') {
    const normalized = draft.trim().toLowerCase();
    if (normalized !== 'true' && normalized !== 'false') throw new Error('Enter true or false for this detail.');
    return normalized === 'true';
  }
  return draft;
};
const surface = 'rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]';
const muted = 'text-[var(--vyra-text-muted)]';
const subtle = 'text-[var(--vyra-text-secondary)]';
const primary = 'text-[var(--vyra-text-primary)]';
const field = 'min-h-10 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)] placeholder:text-[var(--vyra-text-muted)]';
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';
const safeDownloadName = (value: string) => value.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'asset';
const prettyBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
};
const storageObjectFilename = (assetId: string, file: File) => {
  // Keep arbitrary Unicode filenames in metadata, not in Storage object keys.
  const extension = file.name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? 'bin';
  return assetId + '.' + extension;
};
const assetType = (file: File) => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (['glb','gltf','obj','fbx','stl','usdz','blend'].includes(ext)) return 'model_3d';
  if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
  if (file.type.startsWith('text/') || file.type === 'application/pdf' || file.type.includes('document') || ['doc','docx','xls','xlsx','ppt','pptx','pdf','txt','md','json'].includes(ext)) return 'document';
  return 'other';
};
const typeIcon = (type: string) => {
  if (type === 'image') return ImageIcon;
  if (type === 'video') return Video;
  if (type === 'audio') return Music2;
  if (type === 'document') return FileText;
  if (type === 'model_3d') return Box;
  if (type === 'archive') return Archive;
  return FileIcon;
};
const dateLabel = (value: string) => new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'undefined';
};
const flattenObservation = (value: unknown, prefix = ''): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return prefix ? { [prefix]: stableJson(value) } : {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return prefix ? { [prefix]: '{}' } : {};
  return entries.reduce<Record<string, string>>((result, [key, child]) => ({
    ...result,
    ...flattenObservation(child, prefix ? prefix + '.' + key : key),
  }), {});
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const formatRgb = (value: unknown) =>
  Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((channel) => Number(channel).toFixed(0)).join(', ')
    : '—';

export const VyralDetailsContent: React.FC<Props> = ({ vyral, searchQuery, onVyralUpdated, onSendAssetsToChat }) => {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('assets');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showSystemFiles, setShowSystemFiles] = useState(false);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [comparingReconstructionAssetId, setComparingReconstructionAssetId] = useState<string | null>(null);
  const [extractingDnaV3, setExtractingDnaV3] = useState(false);
  const [verifyingDnaV3, setVerifyingDnaV3] = useState(false);
  const [packageStatus, setPackageStatus] = useState('');
  const [reconstructedPngDownload, setReconstructedPngDownload] = useState<{ blob: Blob; filename: string } | null>(null);
  const [error, setError] = useState('');
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [collectionReferences, setCollectionReferences] = useState<CollectionReferenceRow[]>([]);
  const [versions, setVersions] = useState<AssetVersionRow[]>([]);
  const [dnaRecords, setDnaRecords] = useState<DnaRow[]>([]);
  const [fingerprints, setFingerprints] = useState<FingerprintRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [lineage, setLineage] = useState<LineageRow[]>([]);
  const [reconstructionTests, setReconstructionTests] = useState<ReconstructionRow[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState('all');
  const [localSearch, setLocalSearch] = useState('');
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [dnaNote, setDnaNote] = useState('');
  const [dnaAssetId, setDnaAssetId] = useState('');
  const [visionAssetId, setVisionAssetId] = useState('');
  const [visionVersionId, setVisionVersionId] = useState('');
  const [visionTaskKind, setVisionTaskKind] = useState('description');
  const [visionProvider, setVisionProvider] = useState('external_model');
  const [visionModel, setVisionModel] = useState('user_supplied');
  const [visionConfidence, setVisionConfidence] = useState('');
  const [visionJson, setVisionJson] = useState('{"summary":"","attributes":[],"uncertainties":[]}');
  const [savingVision, setSavingVision] = useState(false);
  const [reviewingObservationId, setReviewingObservationId] = useState<string | null>(null);
  const [promotingObservationId, setPromotingObservationId] = useState<string | null>(null);
  const [resolvingConflictKey, setResolvingConflictKey] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<AssetRow | null>(null);
  const [detailsAsset, setDetailsAsset] = useState<AssetRow | null>(null);
  const [detailsDraft, setDetailsDraft] = useState({ name: '', description: '', category: '', style: '', tags: '' });
  const [detailsExtraDraft, setDetailsExtraDraft] = useState<Record<string, string>>({});
  const [collectionDetailsOpen, setCollectionDetailsOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState({ name: vyral.name, description: vyral.description ?? '', category: '', style: '', tags: '' });
  const [collectionDetailsBaseline, setCollectionDetailsBaseline] = useState<typeof collectionDraft | null>(null);
  const [collectionExtraDraft, setCollectionExtraDraft] = useState<Record<string, string>>({});
  const [collectionExtraBaseline, setCollectionExtraBaseline] = useState<Record<string, string>>({});
  const [collectionExtraBaselineValues, setCollectionExtraBaselineValues] = useState<Record<string, VyralDetailValue>>({});
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [licenseDraft, setLicenseDraft] = useState({
    allow_ai_analysis: true, allow_ai_generation: true, allow_remix: false,
    allow_redistribution: false, commercial_use: false, require_attribution: true,
  });
  const [referenceChecks, setReferenceChecks] = useState<Record<string, { status: 'checking' } | { status: 'current'; revision: number; assetCount: number; assets: PublicCollectionAssetReferenceV1[] } | { status: 'newer_revision'; revision: number; assetCount: number; assets: PublicCollectionAssetReferenceV1[] } | { status: 'error'; message: string }>>({});
  const [masterDnaPurposeDraft, setMasterDnaPurposeDraft] = useState(vyral.master_dna_purpose ?? '');
  const [masterDnaUsesDraft, setMasterDnaUsesDraft] = useState((vyral.master_dna_intended_uses ?? []).join(', '));
  const [masterDnaStatus, setMasterDnaStatus] = useState(vyral.master_dna_status ?? 'not_started');
  const [masterDnaRevision, setMasterDnaRevision] = useState(vyral.master_dna_revision ?? 0);
  const [masterDnaAvailable, setMasterDnaAvailable] = useState(false);
  const [masterDnaSaving, setMasterDnaSaving] = useState(false);
  const [masterDnaBuilding, setMasterDnaBuilding] = useState(false);
  const [masterDnaMessage, setMasterDnaMessage] = useState('');
  const [masterDnaBlockers, setMasterDnaBlockers] = useState<Array<{ code: string; asset_id?: string; message: string }>>([]);
  const [masterAssetDrafts, setMasterAssetDrafts] = useState<Record<string, MasterAssetDraft>>({});
  const [masterRelationships, setMasterRelationships] = useState<MasterRelationshipRow[]>([]);
  const masterDnaAutoBuildRef = useRef(false);
  const fileDnaAutoVerifyRef = useRef(new Set<string>());


  const loadWorkspace = useCallback(async () => {
    if (!supabase) { setError('Cloud storage is not configured for this environment.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    const results = await Promise.all([
      supabase.from('vyral_folders').select('*').eq('vyral_id', vyral.id).order('name'),
      supabase.from('vyral_assets').select('*').eq('vyral_id', vyral.id).neq('processing_status', 'archived').order('created_at', { ascending: false }),
      supabase.from('vyral_asset_versions').select('*').eq('vyral_id', vyral.id).order('version_number', { ascending: false }),
      supabase.from('vyral_dna_records').select('*').eq('vyral_id', vyral.id).order('created_at', { ascending: false }),
      supabase.from('vyral_lineage').select('*').eq('vyral_id', vyral.id).order('created_at', { ascending: false }),
      supabase.from('vyral_reconstruction_tests').select('*').eq('vyral_id', vyral.id).order('created_at', { ascending: false }),
      supabase.from('vyrals').select('master_dna_status,master_dna_revision,master_dna_purpose,master_dna_intended_uses').eq('id', vyral.id).single(),
      supabase.from('vyral_asset_relationships').select('id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale').eq('vyral_id', vyral.id).order('created_at', { ascending: true }),
      supabase.from('vyral_master_dna_asset_metadata').select('asset_id,role,purpose').eq('vyral_id', vyral.id).eq('user_id', auth.user?.id ?? ''),
      supabase.from('vyral_collection_references').select('id,source_vyral_id,source_revision,source_visibility,resolver_uri,projection_sha256,compact_snapshot,imported_at').eq('destination_vyral_id', vyral.id).order('imported_at', { ascending: false }),
    ]);
    const failed = results.slice(0, 6).find((item) => item.error);
    if (failed?.error) { setError(failed.error.message); setLoading(false); return; }
    const assetRows = (results[1].data ?? []) as AssetRow[];
    const assetIds = assetRows.map((item) => item.id);
    const [fingerprintResult, observationResult] = assetIds.length ? await Promise.all([
      supabase.from('vyral_fingerprints').select('*').in('asset_id', assetIds).order('created_at', { ascending: false }).limit(1000),
      supabase.from('vyral_vision_observations').select('*').in('asset_id', assetIds).order('created_at', { ascending: false }).limit(1000),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (fingerprintResult.error || observationResult.error) {
      setError(fingerprintResult.error?.message ?? observationResult.error?.message ?? 'Could not load Vyral identity evidence.');
      setLoading(false);
      return;
    }
    setFolders((results[0].data ?? []) as FolderRow[]);
    setAssets(assetRows);
    setCollectionReferences((results[9].data ?? []) as CollectionReferenceRow[]);
    setVersions((results[2].data ?? []) as AssetVersionRow[]);
    setDnaRecords((results[3].data ?? []) as DnaRow[]);
    setFingerprints((fingerprintResult.data ?? []) as FingerprintRow[]);
    setObservations((observationResult.data ?? []) as ObservationRow[]);
    setLineage((results[4].data ?? []) as LineageRow[]);
    setReconstructionTests((results[5].data ?? []) as ReconstructionRow[]);
    const masterRootResult = results[6];
    const masterEdgesResult = results[7];
    const masterMetadataResult = results[8];
    // Collection DNA composition depends on the Vyral root and Asset DNA inventory only.
    // Creator relationships and per-Asset role/purpose metadata are optional context;
    // a missing or unreadable optional table must never block automatic composition.
    const masterSchemaReady = !masterRootResult.error && Boolean(masterRootResult.data);
    setMasterDnaAvailable(masterSchemaReady);
    if (masterSchemaReady) {
      setMasterDnaMessage('');
      const masterRoot = masterRootResult.data as Pick<Vyral, 'master_dna_status' | 'master_dna_revision' | 'master_dna_purpose' | 'master_dna_intended_uses'>;
      const masterEdges = (masterEdgesResult.data ?? []) as MasterRelationshipRow[];
      const masterMetadata = new Map<string, { role: 'main' | 'supporting'; purpose: string }>(
        (masterMetadataResult.data ?? []).map((item: { asset_id: string; role: 'main' | 'supporting'; purpose: string }) => [item.asset_id, { role: item.role, purpose: item.purpose }]),
      );
      setMasterRelationships(masterEdges);
      setMasterDnaPurposeDraft(masterRoot.master_dna_purpose ?? '');
      setMasterDnaUsesDraft((masterRoot.master_dna_intended_uses ?? []).join(', '));
      setMasterDnaStatus(masterRoot.master_dna_status ?? 'not_started');
      setMasterDnaRevision(masterRoot.master_dna_revision ?? 0);
      setMasterAssetDrafts(Object.fromEntries(assetRows.map((asset) => {
        const edge = masterEdges.find((item) => item.relationship_type === 'master_membership' && item.from_kind === 'asset' && item.from_asset_id === asset.id);
        const metadata = masterMetadata.get(asset.id);
        return [asset.id, {
          role: metadata?.role ?? '',
          purpose: metadata?.purpose ?? '',
          targetAssetId: edge?.to_kind === 'asset' && edge.to_asset_id ? edge.to_asset_id : '__vyral__',
          rationale: edge?.rationale ?? '',
        }];
      })));
    } else {
      setMasterRelationships([]);
      setMasterDnaPurposeDraft('');
      setMasterDnaUsesDraft('');
      setMasterDnaStatus('not_available');
      setMasterDnaRevision(0);
      setMasterAssetDrafts(Object.fromEntries(assetRows.map((asset) => [asset.id, {
        role: '', purpose: '', targetAssetId: '__vyral__', rationale: '',
      }])));
      setMasterDnaMessage('Master DNA database migration is not applied in this environment yet. Existing Vyral tools remain available.');
    }
    const policy = (vyral.license_policy ?? {}) as Record<string, unknown>;
    setLicenseDraft({
      allow_ai_analysis: policy.allow_ai_analysis !== false,
      allow_ai_generation: policy.allow_ai_generation !== false,
      allow_remix: policy.allow_remix === true,
      allow_redistribution: policy.allow_redistribution === true,
      commercial_use: policy.commercial_use === true,
      require_attribution: policy.require_attribution !== false,
    });
    setLoading(false);

    // Automatically complete exact File DNA readback for older and newly
    // imported non-raster Assets before composing the collection snapshot.
    const versionRowsForVerification = (results[2].data ?? []) as AssetVersionRow[];
    const dnaRowsForVerification = (results[3].data ?? []) as DnaRow[];
    const testRowsForVerification = (results[5].data ?? []) as ReconstructionRow[];
    const fileDnaVerificationTasks: Promise<unknown>[] = [];
    const rasterDnaVerificationTasks: Promise<unknown>[] = [];
    for (const asset of assetRows) {
      const sourceVersion = versionRowsForVerification.find((item) =>
        item.asset_id === asset.id && item.storage_path === asset.storage_path
      );
      if (!sourceVersion) continue;
      const rasterDna = dnaRowsForVerification.find((item) => {
        if (item.asset_id !== asset.id || item.scope !== 'asset' || Number(item.schema_version) !== 3) return false;
        const payload = item.payload as Record<string, unknown>;
        const record = payload.dna_record && typeof payload.dna_record === 'object' ? payload.dna_record as Record<string, unknown> : {};
        const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : {};
        return (payload.dna_schema_id === 'vyra.asset-dna' || record.schema_id === 'vyra.asset-dna') &&
          source.asset_version_id === sourceVersion.id;
      });
      if (rasterDna) {
        const alreadyPassedRaster = testRowsForVerification.some((item) =>
          item.asset_id === asset.id && item.asset_version_id === sourceVersion.id && item.dna_record_id === rasterDna.id &&
          item.comparison_mode === 'decoded_exact' && item.test_status === 'passed' &&
          item.exact_match === true && item.model_id === 'vyral-dna-v3-readback-verifier'
        );
        const rasterAttemptKey = asset.id + ':' + sourceVersion.id + ':' + rasterDna.id;
        if (!alreadyPassedRaster && !fileDnaAutoVerifyRef.current.has(rasterAttemptKey)) {
          fileDnaAutoVerifyRef.current.add(rasterAttemptKey);
          rasterDnaVerificationTasks.push(
            supabase.functions.invoke('verify-vyral-dna-v3', {
              body: { assetId: asset.id, versionId: sourceVersion.id, dnaRecordId: rasterDna.id },
            }).then(({ data, error: verifyError }) => {
              if (verifyError || data?.status !== 'passed' || data?.originalBytesUnchanged !== true) {
                console.warn('[vyral-dna-v3] Exact decoded-sample readback is pending for an Asset.');
                fileDnaAutoVerifyRef.current.delete(rasterAttemptKey);
              }
              return data;
            }).catch(() => {
              fileDnaAutoVerifyRef.current.delete(rasterAttemptKey);
              return undefined;
            }),
          );
        }
      }
      const fileDna = dnaRowsForVerification.find((item) => {
        if (item.asset_id !== asset.id || item.scope !== 'asset' || Number(item.schema_version) !== 1) return false;
        const payload = item.payload as Record<string, unknown>;
        const record = payload.dna_record && typeof payload.dna_record === 'object' ? payload.dna_record as Record<string, unknown> : {};
        const source = record.source && typeof record.source === 'object' ? record.source as Record<string, unknown> : {};
        return (payload.dna_schema_id === 'vyra.asset-file-dna' || record.schema_id === 'vyra.asset-file-dna') &&
          (source.asset_version_id === sourceVersion.id || payload.source_version_id === sourceVersion.id);
      });
      if (!fileDna) continue;
      const alreadyPassed = testRowsForVerification.some((item) =>
        item.asset_id === asset.id && item.asset_version_id === sourceVersion.id && item.dna_record_id === fileDna.id &&
        item.comparison_mode === 'byte_exact' && item.test_status === 'passed' &&
        item.exact_match === true && item.model_id === 'universal-file-dna-v1-readback-verifier'
      );
      const attemptKey = asset.id + ':' + sourceVersion.id + ':' + fileDna.id;
      if (alreadyPassed || fileDnaAutoVerifyRef.current.has(attemptKey)) continue;
      fileDnaAutoVerifyRef.current.add(attemptKey);
      fileDnaVerificationTasks.push(
        supabase.functions.invoke('verify-vyral-asset', {
          body: { assetId: asset.id, versionId: sourceVersion.id },
        }).then(({ data, error: verifyError }) => {
          if (verifyError || data?.status !== 'verified' || data?.sourceFileReconstruction !== 'byte_exact') {
            console.warn('[vyral-file-dna] Exact source readback is pending for an Asset.');
            fileDnaAutoVerifyRef.current.delete(attemptKey);
          }
          return data;
        }).catch(() => {
          fileDnaAutoVerifyRef.current.delete(attemptKey);
          return undefined;
        }),
      );
    }
    if (fileDnaVerificationTasks.length) await Promise.all(fileDnaVerificationTasks);
    if (rasterDnaVerificationTasks.length) await Promise.all(rasterDnaVerificationTasks);

    // Keep the collection snapshot synchronized in the background. The builder
    // only requires each Asset's own current version and matching DNA; optional
    // creator context and semantic relationships never block this process.
    const masterRoot = masterRootResult.data as Pick<Vyral, 'master_dna_status'> | null;
    if (masterSchemaReady && assetRows.length > 0 && masterRoot?.master_dna_status !== 'ready' && !masterDnaAutoBuildRef.current) {
      masterDnaAutoBuildRef.current = true;
      void (async () => {
        try {
          const { data, error: buildError } = await supabase.functions.invoke('build-vyral-master-dna', {
            body: { vyralId: vyral.id },
          });
          if (buildError || data?.status !== 'ready') {
            // Keep internal diagnostics out of the customer-facing workspace.
            setMasterDnaMessage('Your collection is still being prepared. VYRA will try again when you return to this collection.');
            return;
          }
          setMasterDnaStatus('ready');
          setMasterDnaRevision(Number(data.revision ?? 0));
          setMasterDnaMessage('');
        } catch {
          setMasterDnaMessage('Your collection is still being prepared. VYRA will try again when you return to this collection.');
        } finally {
          masterDnaAutoBuildRef.current = false;
        }
      })();
    }
  }, [vyral.id, vyral.license_policy]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  // Keep collection-level suggestions synchronized with its Asset inventory.
  // Creator-edited fields are preserved by mergeVyralAiDetails; AI is optional.
  const collectionAiAttemptRef = useRef('');
  useEffect(() => {
    if (!supabase || loading) return;
    const inventorySignature = assets
      .map((asset) => [
        asset.id, asset.name, asset.asset_type, asset.mime_type, asset.updated_at, asset.sha256 ?? '',
        asset.description ?? '', JSON.stringify(asset.metadata?.ai_details ?? {}),
      ].join(':'))
      .sort()
      .join('|');
    let revision = 2166136261;
    for (let index = 0; index < inventorySignature.length; index += 1) {
      revision ^= inventorySignature.charCodeAt(index);
      revision = Math.imul(revision, 16777619);
    }
    revision >>>= 0;
    const attemptKey = vyral.id + ':' + revision;
    const currentMetadata = vyral.metadata ?? {};
    const currentDetails = currentMetadata.ai_details as VyralAiDetails | undefined;
    if (collectionAiAttemptRef.current === attemptKey) return;
    if (currentDetails && currentDetails.source_revision === revision && !currentDetails.stale &&
        currentMetadata.ai_details_status === 'ready') {
      collectionAiAttemptRef.current = attemptKey;
      return;
    }
    collectionAiAttemptRef.current = attemptKey;
    void (async () => {
      try {
        const accessToken = await getCurrentAccessToken();
        if (!accessToken) throw new Error('AI details are unavailable without an active session.');
        let analysisName = vyral.name;
        let analysisDescription = vyral.description ?? '';
        let analysisDetails = currentDetails;
        if (currentDetails && (currentDetails.source_revision !== revision || currentDetails.stale)) {
          const { data: beforeAnalysis } = await supabase.from('vyrals').select('name,description,metadata').eq('id', vyral.id).maybeSingle();
          if (beforeAnalysis) {
            analysisName = beforeAnalysis.name ?? analysisName;
            analysisDescription = beforeAnalysis.description ?? analysisDescription;
            const latestBeforeMetadata = beforeAnalysis.metadata && typeof beforeAnalysis.metadata === 'object' && !Array.isArray(beforeAnalysis.metadata)
              ? beforeAnalysis.metadata as Record<string, unknown> : {};
            const latestBeforeDetails = latestBeforeMetadata.ai_details as VyralAiDetails | undefined;
            if (latestBeforeDetails) {
              analysisDetails = latestBeforeDetails;
              if (latestBeforeDetails.source_revision !== revision || latestBeforeDetails.stale) {
                const staleMetadata = {
                  ...latestBeforeMetadata,
                  ai_details: markVyralAiDetailsStale(latestBeforeDetails),
                  ai_details_status: 'refreshing',
                  ai_details_source_revision: revision,
                };
                const { error: staleError } = await supabase.from('vyrals').update({ metadata: staleMetadata }).eq('id', vyral.id);
                if (!staleError) onVyralUpdated({ metadata: staleMetadata });
              }
            }
          }
        }
        const suggested = await suggestVyralCollectionDetails({
          accessToken,
          vyralId: vyral.id,
          currentName: analysisName,
          currentDescription: analysisDescription,
          sourceRevision: revision,
          assets: assets.slice(0, 80).map((asset) => {
            const detailFields = (asset.metadata?.ai_details as VyralAiDetails | undefined)?.fields ?? {};
            const tags = Array.isArray(detailFields.tags?.value)
              ? detailFields.tags.value.filter((tag): tag is string => typeof tag === 'string').slice(0, 10) : [];
            return {
              name: asset.name, assetType: asset.asset_type, mimeType: asset.mime_type,
              description: asset.description ?? '', tags,
            };
          }),
          currentDetails: analysisDetails,
        });
        // A newer inventory analysis supersedes this request; never write stale collection suggestions.
        if (collectionAiAttemptRef.current !== attemptKey) return;
        // Re-read after model generation so creator edits made while AI was working remain authoritative.
        const { data: latestVyral, error: latestReadError } = await supabase.from('vyrals')
          .select('name,description,metadata').eq('id', vyral.id).maybeSingle();
        if (latestReadError || !latestVyral) throw latestReadError ?? new Error('Vyral was not found.');
        const latestMetadata = latestVyral.metadata && typeof latestVyral.metadata === 'object' && !Array.isArray(latestVyral.metadata)
          ? latestVyral.metadata as Record<string, unknown> : {};
        const aiSuggestions = Object.fromEntries(Object.entries(suggested.fields)
          .filter(([, field]) => field.origin === 'ai_suggested')
          .map(([key, field]) => [key, { value: field.value, ...(field.confidence === undefined ? {} : { confidence: field.confidence }) }]));
        const mergedDetails = mergeVyralAiDetails(latestMetadata.ai_details, {
          scope: 'vyral', sourceRevision: revision, provider: suggested.provider, model: suggested.model,
          generatedAt: suggested.generated_at, suggestions: aiSuggestions,
        });
        const latestNameOrigin = latestMetadata.identity_name_origin ?? 'creator_confirmed';
        const latestDescriptionOrigin = latestMetadata.identity_description_origin ?? 'creator_confirmed';
        const suggestedName = typeof mergedDetails.fields.name?.value === 'string' ? mergedDetails.fields.name.value.trim().slice(0, 100) : '';
        const suggestedDescription = typeof mergedDetails.fields.description?.value === 'string' ? mergedDetails.fields.description.value.trim().slice(0, 1000) : '';
        const updateName = Boolean(suggestedName) && ['system_default', 'ai_suggested'].includes(String(latestNameOrigin));
        const updateDescription = Boolean(suggestedDescription) && ['system_default', 'ai_suggested'].includes(String(latestDescriptionOrigin));
        if (collectionAiAttemptRef.current !== attemptKey) return;
        const nextMetadata = {
          ...latestMetadata,
          ai_details: mergedDetails,
          ai_details_status: 'ready',
          ai_details_source_revision: revision,
          ai_details_inventory_signature: String(revision),
          ...(updateName ? { identity_name_origin: 'ai_suggested' } : {}),
          ...(updateDescription ? { identity_description_origin: 'ai_suggested' } : {}),
        };
        const { error: saveError } = await supabase.from('vyrals').update({
          ...(updateName ? { name: suggestedName } : {}),
          ...(updateDescription ? { description: suggestedDescription } : {}),
          metadata: nextMetadata,
        }).eq('id', vyral.id);
        if (saveError) throw saveError;
        onVyralUpdated({
          ...(updateName ? { name: suggestedName } : {}),
          ...(updateDescription ? { description: suggestedDescription } : {}),
          metadata: nextMetadata,
        });
      } catch (cause) {
        console.warn('[vyral-ai-details] Collection suggestions were unavailable.', cause);
        const { data: latestFailureState } = await supabase.from('vyrals').select('metadata').eq('id', vyral.id).maybeSingle();
        if (latestFailureState) {
        const latestFailureMetadata = latestFailureState.metadata && typeof latestFailureState.metadata === 'object' && !Array.isArray(latestFailureState.metadata)
          ? latestFailureState.metadata as Record<string, unknown> : {};
        const latestFailureDetails = latestFailureMetadata.ai_details as VyralAiDetails | undefined;
        const latestDetailsAreCurrent = Boolean(latestFailureDetails && latestFailureDetails.source_revision === revision && !latestFailureDetails.stale);
        const unavailableMetadata = {
          ...latestFailureMetadata,
          ...(latestFailureDetails && !latestDetailsAreCurrent ? { ai_details: markVyralAiDetailsStale(latestFailureDetails) } : {}),
          ai_details_status: latestDetailsAreCurrent ? 'ready' : 'unavailable',
        };
        const { error: statusError } = await supabase.from('vyrals').update({ metadata: unavailableMetadata }).eq('id', vyral.id);
        if (!statusError) onVyralUpdated({ metadata: unavailableMetadata });
        }
      }
    })();
  }, [assets, loading, vyral.id, vyral.name, vyral.description, vyral.metadata, onVyralUpdated]);


  const originV2LatestTests = useMemo(() => {
    const providers = ['Anthropic', 'Google Gemini', 'xAI'];
    return providers.map((provider) => reconstructionTests.find((test) =>
      test.protocol_version === 'ORIGIN-01-v2' && test.model_provider === provider
    )).filter((test): test is ReconstructionRow => Boolean(test));
  }, [reconstructionTests]);

  const filteredAssets = useMemo(() => {
    const search = (searchQuery + ' ' + localSearch).trim().toLowerCase();
    return assets.filter((asset) => asset.folder_id === activeFolderId)
      .filter((asset) => assetFilter === 'all' || asset.asset_type === assetFilter)
      .filter((asset) => !search || (asset.name + ' ' + asset.original_filename + ' ' + asset.description).toLowerCase().includes(search));
  }, [assets, activeFolderId, assetFilter, searchQuery, localSearch]);
  const visibleFolders = folders.filter((folder) => folder.parent_id === activeFolderId);
  const selectedAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
  const sendSelectedAssetsToChat = () => {
    if (!onSendAssetsToChat || !selectedAssets.length) return;
    onSendAssetsToChat(selectedAssets.map((asset) => ({ id: asset.id, vyralId: vyral.id, vyralName: vyral.name, name: asset.name, assetType: asset.asset_type, mimeType: asset.mime_type, description: asset.description ?? '', visibility: asset.metadata?.visibility === 'public' ? 'public' : 'private' })));
  };
  const toggleAssetSelection = (assetId: string) => setSelectedAssetIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
  const updateAssetVisibility = async (targetIds: string[], visibility: 'private' | 'public') => {
    if (!supabase || !targetIds.length || busy) return;
    setBusy(true); setError('');
    try {
      for (const id of targetIds) {
        const asset = assets.find((item) => item.id === id);
        if (!asset) continue;
        const { error: updateError } = await supabase.from('vyral_assets').update({ metadata: { ...(asset.metadata ?? {}), visibility } }).eq('id', id).eq('vyral_id', vyral.id);
        if (updateError) throw updateError;
      }
      setSelectedAssetIds((current) => current.filter((id) => !targetIds.includes(id)));
      await loadWorkspace();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update Asset visibility.'); }
    finally { setBusy(false); }
  };
  const folderPath = useMemo(() => {
    const result: FolderRow[] = [];
    let current = folders.find((folder) => folder.id === activeFolderId);
    while (current) {
      result.unshift(current);
      current = current.parent_id ? folders.find((folder) => folder.id === current?.parent_id) : undefined;
    }
    return result;
  }, [folders, activeFolderId]);
  const totalBytes = assets.reduce((sum, item) => sum + Number(item.size_bytes || 0), 0);
  const selectedDnaRecords = dnaRecords.filter((item) => !dnaAssetId || item.asset_id === dnaAssetId || (dnaAssetId === 'vyral' && item.scope === 'vyral'));
  const visionComparisonGroups = useMemo(() => {
    const groups = new Map<string, ObservationRow[]>();
    observations.forEach((item) => {
      if (!item.asset_version_id) return;
      const key = item.asset_id + ':' + item.asset_version_id + ':' + item.task_kind;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return Array.from(groups.entries()).map(([key, items]) => {
      const models = new Set(items.map((item) => item.model_provider + ' · ' + item.model_id));
      const flattened = items.map((item) => ({ item, values: flattenObservation(item.observation) }));
      const paths = Array.from(new Set(flattened.flatMap((entry) => Object.keys(entry.values)))).sort();
      const comparisons = paths.map((path) => {
        const values = flattened.map((entry) => entry.values[path] ?? '[missing]');
        return { path, same: values.every((value) => value === values[0]), values };
      });
      return { key, items, modelCount: models.size, comparisons };
    }).filter((group) => group.modelCount > 1).sort((a, b) => b.items[0].created_at.localeCompare(a.items[0].created_at));
  }, [observations]);

  const visionKnowledgeConflicts = useMemo(() => {
    const groups = new Map<string, { assetId: string; versionId: string; taskKind: string; fieldPath: string; records: DnaRow[] }>();
    dnaRecords.forEach((record) => {
      const payload = record.payload ?? {};
      if (record.source_kind !== 'creator' || record.verification_status !== 'creator_confirmed' || payload.promotion_source !== 'creator_approved_vision_field' || typeof payload.promotion_field_path !== 'string' || typeof payload.source_asset_version_id !== 'string' || typeof payload.promotion_observation_id !== 'string' || !Object.prototype.hasOwnProperty.call(payload, 'accepted_value')) return;
      const taskKind = typeof payload.task_kind === 'string' ? payload.task_kind : 'unknown_task';
      const key = JSON.stringify([record.asset_id, payload.source_asset_version_id, taskKind, payload.promotion_field_path]);
      const group = groups.get(key) ?? { assetId: record.asset_id ?? '', versionId: payload.source_asset_version_id, taskKind, fieldPath: payload.promotion_field_path, records: [] };
      group.records.push(record); groups.set(key, group);
    });
    return Array.from(groups.values()).map((group) => {
      const recordIds = new Set(group.records.map((record) => record.id));
      const resolutionRecords = dnaRecords.filter((record) => {
        const payload = record.payload ?? {};
        const scope = payload.conflict_scope as Record<string, unknown> | undefined;
        const competingIds = payload.competing_promotion_record_ids;
        return record.source_kind === 'creator' && record.verification_status === 'creator_confirmed' &&
          payload.record_kind === 'vision_field_conflict_resolution' &&
          payload.resolution_source === 'server_creator_conflict_resolution' &&
          scope?.asset_id === group.assetId && scope?.source_asset_version_id === group.versionId &&
          scope?.task_kind === group.taskKind && scope?.field_path === group.fieldPath &&
          Array.isArray(competingIds) && competingIds.length >= 2 &&
          competingIds.every((id) => typeof id === 'string' && recordIds.has(id));
      }).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return { ...group, resolutionRecords, distinctValueCount: new Set(group.records.map((record) => stableJson(record.payload.accepted_value))).size };
    }).filter((group) => group.distinctValueCount > 1).sort((a, b) => b.records[0].created_at.localeCompare(a.records[0].created_at));
  }, [dnaRecords]);
  const exportVyralPackage = async (components: VyralExportComponents = { assets: true, fullDna: true, compactDna: true }, selectedAssetId?: string) => {
    const dnaOnly = !components.assets && components.fullDna;
    if (!supabase || packageBusy) return;
    setPackageBusy(true);
    setError('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again before exporting this Vyral.');
      const packageAssets = selectedAssetId ? assets.filter((asset) => asset.id === selectedAssetId) : assets;
      if (selectedAssetId && packageAssets.length !== 1) throw new Error('The selected Asset is no longer available in this Vyral.');
      const packageEntries: { path: string; data: Uint8Array | string }[] = [];
      const packageVersions: Record<string, unknown>[] = [];
      let portableMasterDna: Awaited<ReturnType<typeof validateVyralMasterDnaV1>> | null = null;
      if (masterDnaAvailable) {
        const { data: rootRow, error: rootError } = await supabase
          .from('vyrals')
          .select('master_dna_status,master_dna_revision')
          .eq('id', vyral.id)
          .eq('user_id', auth.user.id)
          .single();
        if (!rootError && rootRow?.master_dna_status === 'ready') {
          const { data: revisionRow, error: revisionError } = await supabase
            .from('vyral_master_dna_revisions')
            .select('snapshot,revision')
            .eq('vyral_id', vyral.id)
            .eq('user_id', auth.user.id)
            .order('revision', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!revisionError && revisionRow?.snapshot) {
            try {
              const candidate = await validateVyralMasterDnaV1(revisionRow.snapshot);
              if (candidate.snapshot.revision === Number(rootRow.master_dna_revision)) {
                portableMasterDna = candidate;
              }
            } catch {
              // The collection snapshot is a derived convenience. Per-Asset DNA
              // remains authoritative, so a missing/stale snapshot never blocks export.
            }
          }
        }
      }
      if (components.compactDna && !portableMasterDna) throw new Error('Collection reference data is not ready yet. Please try again after the Vyral finishes updating.');
      let totalMediaBytes = 0;
      const ownerless = <T extends Record<string, unknown>>(record: T) => {
        const { user_id: _userId, vyral_id: _vyralId, storage_path: _storagePath, ...safe } = record;
        return safe;
      };

      for (const asset of (components.assets ? assets : [])) {
        const savedVersions = versions.filter((version) => version.asset_id === asset.id);
        const sourceVersions = savedVersions.length ? savedVersions : [{
          id: 'current-' + asset.id,
          asset_id: asset.id,
          storage_path: asset.storage_path,
          version_number: 1,
          sha256: asset.sha256,
          mime_type: asset.mime_type,
          size_bytes: asset.size_bytes,
          source_kind: 'original',
          parent_version_id: null,
          metadata: { fallback_current_asset: true },
          created_at: asset.created_at,
        }];
        for (const version of sourceVersions) {
          const { data: fileBlob, error: downloadError } = await supabase.storage.from('vyral-assets').download(version.storage_path);
          if (downloadError || !fileBlob) throw new Error('Could not package ' + asset.name + ' version ' + version.version_number + ': ' + (downloadError?.message ?? 'media file missing'));
          totalMediaBytes += fileBlob.size;
          if (totalMediaBytes > 200 * 1024 * 1024) throw new Error('This Vyral is larger than the 200 MB export limit. Export smaller Vyrals separately.');
          const bytes = new Uint8Array(await fileBlob.arrayBuffer());
          const digestBuffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(digestBuffer).set(bytes);
          const digest = await crypto.subtle.digest('SHA-256', digestBuffer);
          const actualHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
          if (version.sha256 && version.sha256 !== actualHash) throw new Error('Integrity check failed for ' + asset.name + ' version ' + version.version_number + '. The stored file does not match its recorded SHA-256.');
          const packagePath = 'assets/' + asset.id + '/versions/' + version.version_number + '-' + version.id + '.bin';
          packageEntries.push({ path: packagePath, data: bytes });
          packageVersions.push({
            ...ownerless(version as unknown as Record<string, unknown>),
            sha256: actualHash,
            mime_type: version.mime_type || asset.mime_type,
            size_bytes: bytes.byteLength,
            package_path: packagePath,
          });
        }
      }

      const manifest = {
        exportMode: dnaOnly ? 'dna-only' : (!components.assets && !components.fullDna ? 'compact-only' : 'full'),
        exportComponents: { ...components },
        format: VYRAL_PACKAGE_FORMAT,
        formatVersion: VYRAL_PACKAGE_VERSION,
        packageId: crypto.randomUUID(),
        exportedAt: new Date().toISOString(),
        vyral: {
          id: vyral.id,
          name: vyral.name,
          description: vyral.description,
          visibility: vyral.visibility,
          dna_status: vyral.dna_status,
          license_policy: vyral.license_policy ?? {},
          ...(!selectedAssetId ? {
            metadata: {
              ai_details: (vyral.metadata ?? {}).ai_details ?? null,
              identity_name_origin: (vyral.metadata ?? {}).identity_name_origin ?? 'creator_confirmed',
              identity_description_origin: (vyral.metadata ?? {}).identity_description_origin ?? (vyral.description ? 'creator_confirmed' : 'system_default'),
            },
          } : {}),
        },
        ...(!selectedAssetId && components.compactDna && portableMasterDna ? { masterDna: portableMasterDna } : {}),
        folders: components.assets ? folders.map((item) => ownerless(item as unknown as Record<string, unknown>)) : [],
        assets: packageAssets.map((item) => ownerless(item as unknown as Record<string, unknown>)), 
        versions: packageVersions,
        dnaRecords: (components.fullDna ? dnaRecords.filter((item) => !dnaOnly || !selectedAssetId || item.asset_id === selectedAssetId) : []).map((item) => {
          const safeRecord = ownerless(item as unknown as Record<string, unknown>);
          const safePayload = { ...asRecord(safeRecord.payload) };
          delete safePayload.tile_storage_paths;
          const nestedRecord = asRecord(safePayload.dna_record);
          const isPortableAssetDna =
            (safePayload.dna_schema_id === 'vyra.asset-dna' && safePayload.dna_schema_version === 3) ||
            (safePayload.dna_schema_id === 'vyra.asset-file-dna' && safePayload.dna_schema_version === 1);
          return {
            ...safeRecord,
            ...(isPortableAssetDna && typeof nestedRecord.record_id === 'string' ? { id: nestedRecord.record_id } : {}),
            payload: safePayload,
          };
        }),
        fingerprints: (components.fullDna ? (dnaOnly ? fingerprints.filter((item) => !item.asset_version_id) : fingerprints) : []).map((item) => ownerless(item as unknown as Record<string, unknown>)),
        // DNA-only exports omit binary versions, so keep only evidence that is not bound to an omitted version.
        
        visionObservations: (components.fullDna ? (dnaOnly ? observations.filter((item) => !item.asset_version_id) : observations) : []).map((item) => ownerless(item as unknown as Record<string, unknown>)), 
        lineage: components.fullDna ? lineage.map((item) => ownerless(item as unknown as Record<string, unknown>)) : [],
        reconstructionTests: (components.fullDna ? (dnaOnly ? reconstructionTests.filter((item) => !item.asset_version_id) : reconstructionTests) : []).map((item) => ownerless(item as unknown as Record<string, unknown>)), 
      };
      packageEntries.push({
        path: 'README.txt',
        data: [
          'VYRAL PORTABLE PACKAGE',
          'Format: ' + VYRAL_PACKAGE_FORMAT,
          'Version: ' + VYRAL_PACKAGE_VERSION,
          components.assets && components.fullDna && components.compactDna
            ? 'Complete Vyral package: original Asset files, full per-Asset reconstruction data, and compact collection reference.'
            : components.assets && components.fullDna
              ? 'Original Asset files and full per-Asset reconstruction data. Compact collection reference is excluded.'
              : components.assets && components.compactDna
                ? 'Original Asset files and compact collection reference. Full per-Asset reconstruction data is excluded.'
                : components.assets
                  ? 'Original Asset files and collection inventory only. Reconstruction data is excluded.'
                  : components.fullDna
                    ? 'Full per-Asset reconstruction data only. Original Asset files are excluded.'
                    : 'Compact collection reference only. Original Asset files and full reconstruction data are excluded.',
          components.assets
            ? 'Original media files are included with SHA-256 values recalculated during export.'
            : components.fullDna
              ? 'Raster DNA v3 preserves decoded samples, not original encoded image bytes. File DNA v1 includes exact source bytes only when all declared chunks pass verification.'
              : 'This reference package contains no original media files or full reconstruction payloads.',
          components.fullDna
            ? 'Raster assets use canonical decoded samples; non-raster assets use lossless raw source-byte chunks with per-chunk and aggregate SHA-256 verification.'
            : components.compactDna
              ? 'Compact collection data identifies the Vyral inventory and points to per-Asset records. It does not grant access to private source files or include credentials.'
              : 'Only original Asset files and their collection inventory are included.',
          components.fullDna
            ? 'Raster DNA v3 does not recover original PNG/JPEG encoded bytes and does not independently verify the source decoder or unknown color space. Imported evidence is not automatically trusted.'
            : components.compactDna
              ? 'External retrieval requires an authorized integration or scoped share. Private Assets remain inaccessible without permission.'
              : 'No reconstruction or collection-reference claims are included.',
          'ZIP entries use the standard Store method (no compression) for broad compatibility.'
        ].join('\n'),
      });
      if (components.fullDna || components.compactDna) {
        packageEntries.push({ path: 'AI_RECONSTRUCTION_GUIDE.md', data: VYRAL_AI_RECONSTRUCTION_GUIDE });
      }
      if (components.fullDna) {
        packageEntries.push({ path: 'tools/reconstruct_vyral.py', data: VYRAL_PORTABLE_RECONSTRUCTION_SCRIPT });
      }
      const manifestJson = JSON.stringify(manifest, null, 2);
      if (new TextEncoder().encode(manifestJson).byteLength > 32 * 1024 * 1024) throw new Error('VYRAL manifest exceeds the 32 MB package limit. Reduce the number of large AI evidence records before exporting.');
      packageEntries.push({ path: 'manifest.json', data: manifestJson });
      let archive: Blob;
      if (components.assets && components.fullDna) {
        for (const sourceRow of dnaRecords.filter((record) =>
          record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3
        )) {
          const dnaRecord = asRecord(sourceRow.payload.dna_record);
          const losslessPayload = asRecord(dnaRecord.lossless_payload);
          const tiles = Array.isArray(losslessPayload.tiles) ? losslessPayload.tiles : [];
          const storagePaths = sourceRow.payload.tile_storage_paths;
          if (!tiles.length || !Array.isArray(storagePaths) || storagePaths.length !== tiles.length) {
            throw new Error('A stored DNA v3 record has an incomplete tile storage map and cannot be exported.');
          }
          for (let index = 0; index < tiles.length; index += 1) {
            const tile = asRecord(tiles[index]);
            const packagePath = typeof tile.package_path === 'string' ? tile.package_path : '';
            const storagePath = storagePaths[index];
            if (!packagePath || typeof storagePath !== 'string') throw new Error('A stored DNA v3 tile mapping is invalid.');
            const { data: tileBlob, error: tileError } = await supabase.storage.from('vyral-assets').download(storagePath);
            if (tileError || !tileBlob) throw new Error('Could not read DNA v3 tile ' + packagePath + ': ' + (tileError?.message ?? 'tile missing'));
            packageEntries.push({ path: packagePath, data: new Uint8Array(await tileBlob.arrayBuffer()) });
          }
        }
      }
      if (dnaOnly) {
        const supportedRows = dnaRecords.filter((record) =>
          (!selectedAssetId || record.asset_id === selectedAssetId) && record.asset_id &&
          ((record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3) ||
           (record.payload?.dna_schema_id === 'vyra.asset-file-dna' && record.payload?.dna_schema_version === 1))
        );
        const dnaRecordsForExport: (VyralDnaV3Record | VyralFileDnaRecord)[] = [];
        const dnaPayloadEntries: { path: string; data: Uint8Array }[] = [];
        for (const asset of packageAssets) {
          const assetVersions = versions.filter((version) => version.asset_id === asset.id);
          const sourceVersion = assetVersions.find((version) => version.storage_path === asset.storage_path)
            ?? [...assetVersions].sort((left, right) => right.version_number - left.version_number)[0];
          if (!sourceVersion?.id || !sourceVersion.storage_path) {
            throw new Error('The current source version for ' + asset.name + ' is unavailable; DNA-only export stopped.');
          }
          const matchingRows = supportedRows.filter((row) => {
            if (row.asset_id !== asset.id) return false;
            const nested = asRecord(row.payload?.dna_record);
            const source = asRecord(nested.source);
            return source.asset_version_id === sourceVersion.id;
          });
          if (matchingRows.length !== 1) {
            throw new Error('Asset ' + asset.name + ' must have exactly one supported DNA record for its current source version before DNA-only export.');
          }
          const sourceRow = matchingRows[0];
          const dnaRecord = asRecord(sourceRow.payload.dna_record);
          if (sourceRow.payload.dna_schema_id === 'vyra.asset-dna') {
            const source = asRecord(dnaRecord.source);
            const losslessPayload = asRecord(dnaRecord.lossless_payload);
            const tiles = Array.isArray(losslessPayload.tiles) ? losslessPayload.tiles : [];
            const storagePaths = sourceRow.payload.tile_storage_paths;
            if (!tiles.length || !Array.isArray(storagePaths) || storagePaths.length !== tiles.length) {
              throw new Error('A stored DNA v3 record for ' + asset.name + ' has an incomplete tile storage map.');
            }
            const { data: sourceBlob, error: sourceError } = await supabase.storage.from('vyral-assets').download(sourceVersion.storage_path);
            if (sourceError || !sourceBlob) throw new Error('Could not verify the original image for ' + asset.name + ': ' + (sourceError?.message ?? 'source missing'));
            const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
            const digestBuffer = new ArrayBuffer(sourceBytes.byteLength);
            new Uint8Array(digestBuffer).set(sourceBytes);
            const digest = await crypto.subtle.digest('SHA-256', digestBuffer);
            const actualSourceHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
            const expectedSourceHash = String(source.sha256 ?? '').toLowerCase();
            if (!expectedSourceHash || actualSourceHash !== expectedSourceHash ||
                (sourceVersion.sha256 && actualSourceHash !== sourceVersion.sha256.toLowerCase())) {
              throw new Error('The original image for ' + asset.name + ' no longer matches its DNA/source-version SHA-256. Re-extract DNA before exporting.');
            }
            for (let index = 0; index < tiles.length; index += 1) {
              const tile = asRecord(tiles[index]);
              const storagePath = storagePaths[index];
              if (typeof tile.package_path !== 'string' || typeof storagePath !== 'string') {
                throw new Error('The stored DNA v3 tile metadata is invalid for ' + asset.name + '.');
              }
              const { data: tileBlob, error: tileError } = await supabase.storage.from('vyral-assets').download(storagePath);
              if (tileError || !tileBlob) throw new Error('Could not read DNA v3 tile for ' + asset.name + ': ' + (tileError?.message ?? 'tile missing'));
              dnaPayloadEntries.push({ path: tile.package_path, data: new Uint8Array(await tileBlob.arrayBuffer()) });
            }
            dnaRecordsForExport.push(dnaRecord as unknown as VyralDnaV3Record);
          } else {
            const identityRecord = asRecord(dnaRecord);
            const source = asRecord(identityRecord.source);
            const { data: sourceBlob, error: sourceError } = await supabase.storage.from('vyral-assets').download(sourceVersion.storage_path);
            if (sourceError || !sourceBlob) throw new Error('Could not read the original binary for ' + asset.name + ': ' + (sourceError?.message ?? 'source missing'));
            const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
            const fileDna = await createVyralFileDnaV1({
              record_id: String(identityRecord.record_id),
              source: { asset_id: asset.id, asset_version_id: sourceVersion.id },
              bytes: sourceBytes,
              mime_type: sourceVersion.mime_type || asset.mime_type || 'application/octet-stream',
              filename: asset.original_filename || asset.name,
              include_payload: true,
            });
            const actualSourceHash = fileDna.record.file.sha256.toLowerCase();
            const expectedDnaHash = String(source.sha256 ?? asRecord(identityRecord.file).sha256 ?? '').toLowerCase();
            const expectedVersionHash = String(sourceVersion.sha256 ?? '').toLowerCase();
            const expectedAssetHash = String(asset.sha256 ?? '').toLowerCase();
            if (!expectedDnaHash || actualSourceHash !== expectedDnaHash ||
                (expectedVersionHash && actualSourceHash !== expectedVersionHash) ||
                (expectedAssetHash && actualSourceHash !== expectedAssetHash)) {
              throw new Error('The original binary for ' + asset.name + ' no longer matches its DNA, Asset version, and stored Asset fingerprints.');
            }
            dnaPayloadEntries.push(...fileDna.entries);
            dnaRecordsForExport.push(fileDna.record);
          }
        }
        archive = await createVyralAssetDnaOnlyPackage(
          manifest as unknown as Parameters<typeof createVyralAssetDnaOnlyPackage>[0],
          dnaRecordsForExport,
          dnaPayloadEntries,
          components.compactDna,
        );
      } else {
        archive = createVyralZip(packageEntries);
        archive = await selectVyralPackageComponents(archive, components);
      }
      const url = window.URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      const safeName = vyral.name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'Vyral';
      anchor.href = url;
      anchor.download = safeName + '.vyral';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'VYRAL package export failed.');
    } finally {
      setPackageBusy(false);
    }
  };

  const importVyralPackage = async (file: File, containerAssetId?: string) => {
    if (!file || !supabase || packageBusy) return;
    if (file.size > 256 * 1024 * 1024) { setError('VYRAL package exceeds the 256 MB import limit.'); return; }

    setPackageBusy(true);
    setPackageStatus('Reading package…');
    setReconstructedPngDownload(null);
    setError('');
    const createdFolderIds: string[] = [];
    const createdAssetIds: string[] = [];
    const uploadedPaths: string[] = [];
    let importPackageId = '';
    let importUserId = '';
    let reconstructionDownload: { blob: Blob; filename: string } | null = null;
    const importRunId = crypto.randomUUID();
    try {
      const archiveFiles = await readVyralZip(file);
      const manifest = parseVyralManifest(archiveFiles);
      if (String(manifest.exportMode) === 'compact-only') {
        if (manifest.exportComponents?.assets !== false || manifest.exportComponents?.fullDna !== false ||
            manifest.exportComponents?.compactDna !== true || manifest.assets.length || manifest.folders.length ||
            manifest.versions.length || manifest.dnaRecords.length || manifest.fingerprints.length ||
            manifest.visionObservations.length || manifest.lineage.length || manifest.reconstructionTests.length ||
            !manifest.masterDna) {
          throw new Error('This collection reference package contains unexpected source or reconstruction data and cannot be imported safely.');
        }
        const allowedPaths = new Set(['manifest.json', 'README.txt', 'AI_RECONSTRUCTION_GUIDE.md']);
        const unexpectedPaths = [...archiveFiles.keys()].filter((entryPath) => !allowedPaths.has(entryPath));
        if (unexpectedPaths.length) throw new Error('This collection reference package contains unexpected files and was not imported.');
        const compactMasterDna = await validateVyralMasterDnaV1(manifest.masterDna);
        if (compactMasterDna.vyral.vyral_id !== String(manifest.vyral.id ?? '') ||
            compactMasterDna.snapshot.revision < 1) {
          throw new Error('The collection reference identity does not match its package manifest.');
        }
        const { data: currentUser } = await supabase.auth.getUser();
        if (!currentUser.user) throw new Error('Please sign in again before importing a collection reference.');
        const sourceName = compactMasterDna.vyral.name || 'Unnamed collection';
        const resolverAvailable = Boolean(compactMasterDna.portable_projection.resolver_uri);
        const confirmation = 'Save collection reference “' + sourceName + '” in “' + vyral.name + '”?\\n\\n' +
          compactMasterDna.assets.length + ' referenced Assets · Revision ' + compactMasterDna.snapshot.revision +
          '\\n' + (resolverAvailable ? 'Public retrieval can be requested and will be checked again each time.' : 'This reference is identity-only and has no remote retrieval access.') +
          '\\n\\nNo original Assets or media files will be copied.';
        if (!window.confirm(confirmation)) {
          setPackageStatus('');
          setPackageBusy(false);
          return;
        }
        const manifestBytes = new TextEncoder().encode(stableJson(manifest));
        const manifestDigest = await crypto.subtle.digest('SHA-256', manifestBytes);
        const sourceManifestSha256 = Array.from(new Uint8Array(manifestDigest), (byte) => byte.toString(16).padStart(2, '0')).join('');
        const { error: referenceError } = await supabase.from('vyral_collection_references').upsert({
          destination_vyral_id: vyral.id,
          user_id: currentUser.user.id,
          source_vyral_id: compactMasterDna.vyral.vyral_id,
          source_revision: compactMasterDna.snapshot.revision,
          source_schema_id: compactMasterDna.schema_id,
          source_schema_version: compactMasterDna.schema_version,
          source_manifest_sha256: sourceManifestSha256,
          projection_sha256: compactMasterDna.integrity.manifest_sha256,
          source_visibility: compactMasterDna.source_resolution.visibility,
          resolver_uri: compactMasterDna.portable_projection.resolver_uri,
          compact_snapshot: compactMasterDna,
        }, {
          onConflict: 'destination_vyral_id,user_id,source_vyral_id,source_revision',
          ignoreDuplicates: true,
        });
        if (referenceError) throw referenceError;
        setPackageStatus('Collection reference saved.');
        await loadWorkspace();
        return;
      }
      const importAssets = getVyralPackageAssetsForImport(manifest.assets, containerAssetId);
      const importAssetIds = new Set(importAssets.map((asset) => String(asset.id)));
      const manifestAssetIds = new Set(manifest.assets.map((asset) => String(asset.id)));
      if (!importAssets.length) {
        if (manifest.exportMode === 'compact-only' || (!manifest.exportComponents?.assets && manifest.exportComponents?.compactDna)) {
          throw new Error('This is a collection-reference-only package. It contains no original Assets or full per-Asset rebuild data, so it cannot be imported as a restorable Vyral yet. To restore the collection here, export it with Assets or full rebuild data included.');
        }
        throw new Error('This package contains no restorable Assets. The .vyral file used to open it was not duplicated.');
      }
      const importedMasterDna = manifest.masterDna ? await validateVyralMasterDnaV1(manifest.masterDna) : null;
      if (importedMasterDna) {
        const masterAssetIds = new Set(importedMasterDna.assets.map((asset) => asset.asset_id));
        if (masterAssetIds.size !== manifest.assets.length || manifest.assets.some((asset) => !masterAssetIds.has(String(asset.id)))) {
          throw new Error('The package Master DNA inventory does not match its Asset manifest.');
        }
      }
      importPackageId = manifest.packageId;
      if (manifest.exportMode === 'dna-only') {
        const dnaEntries = manifest.dnaRecords.filter((entry) =>
          (entry.dna_schema_id === 'vyra.asset-dna' && entry.dna_schema_version === 3) ||
          (entry.dna_schema_id === 'vyra.asset-file-dna' && entry.dna_schema_version === 1)
        );
        const dnaAssetIds = new Set(dnaEntries.map((entry) => String(entry.asset_id)));
        if (!dnaEntries.length || dnaEntries.length !== manifest.assets.length || dnaAssetIds.size !== manifest.assets.length ||
            manifest.assets.some((asset) => !dnaAssetIds.has(String(asset.id)))) {
          throw new Error('Invalid whole-Vyral DNA-only package: every asset must have exactly one supported exact-reconstruction DNA record.');
        }
        if (manifest.masterDna) {
          const masterDna = await validateVyralMasterDnaV1(manifest.masterDna);
          const masterAssetIds = new Set(masterDna.assets.map((asset) => asset.asset_id));
          if (masterAssetIds.size !== manifest.assets.length || manifest.assets.some((asset) => !masterAssetIds.has(String(asset.id)))) {
            throw new Error('The Master DNA inventory does not match the DNA-only package assets.');
          }
        }
        setPackageStatus('Verifying all raster and binary DNA payloads…');
        for (const dnaEntry of dnaEntries) {
          if (dnaEntry.dna_schema_id === 'vyra.asset-dna') {
            await reconstructVyralDnaV3FromPackage(archiveFiles, String(dnaEntry.id));
          } else {
            await reconstructVyralFileDnaFromPackage(archiveFiles, String(dnaEntry.id));
          }
        }
      }
      const packageName = String(manifest.vyral.name || 'Imported Vyral');
      const assetCount = importAssets.length;
      const folderCount = manifest.folders.length;
      const importedVersionCount = manifest.versions.filter((version) => importAssetIds.has(String(version.asset_id))).length;
      const skippedNestedPackageCount = manifest.assets.length - importAssets.length;
      const skippedPackageNote = skippedNestedPackageCount
        ? '\n\n' + skippedNestedPackageCount + ' nested Vyral package file(s) will be skipped to avoid duplicates.'
        : '';
      if (!window.confirm('Import "' + packageName + '" into "' + vyral.name + '"?\n\n' + assetCount + ' assets · ' + folderCount + ' folders · ' + importedVersionCount + ' versions' + skippedPackageNote + '\n\nExisting content will not be overwritten. Imported verification claims will be marked unverified.')) {
        setPackageStatus('');
        setPackageBusy(false);
        return;
      }
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Please sign in again before importing a VYRAL package.');
      const userId = auth.user.id;
      importUserId = userId;
      const objectValue = (value: unknown): Record<string, unknown> =>
        value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
      const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
      const safeName = (value: unknown, fallback: string, max: number) =>
        (stringValue(value, fallback).trim().replaceAll('/', '-').replaceAll(String.fromCharCode(92), '-').replaceAll(String.fromCharCode(0), '-').slice(0, max) || fallback);
      const safeMimeType = (value: unknown, fallback: string) => {
        const candidate = stringValue(value, fallback).trim();
        const separator = candidate.indexOf('/');
        const isMimeToken = (token: string) => /^[a-zA-Z0-9!#$&^_.+-]+$/.test(token);
        return candidate.length <= 160 && separator > 0 && separator === candidate.lastIndexOf('/') &&
          isMimeToken(candidate.slice(0, separator)) && isMimeToken(candidate.slice(separator + 1))
          ? candidate
          : fallback;
      };
      const allowedAssetTypes = ['image','video','audio','document','model_3d','archive','other'];
      const allowedVersionSources = ['original','generated','edited','restored','derived'];
      const allowedDnaSources = ['creator','generation','vision','audio_analysis','user_report','community','system','verification'];
      const allowedRelations = ['generated_from','edited_from','derived_from','variant_of','restored_from','reference_for'];

      const folderMap = new Map<string, string>();
      const folderNameKeys = new Set(folders.map((item) => (item.parent_id ?? 'root') + '|' + item.name.toLowerCase()));
      const pendingFolders = [...manifest.folders];
      let folderPasses = 0;
      while (pendingFolders.length) {
        const index = pendingFolders.findIndex((item) => !item.parent_id || folderMap.has(String(item.parent_id)));
        if (index < 0 || folderPasses++ > manifest.folders.length) throw new Error('The package folder tree contains a missing parent or circular reference.');
        const [sourceFolder] = pendingFolders.splice(index, 1);
        const oldId = stringValue(sourceFolder.id);
        if (!oldId) throw new Error('A package folder is missing its identity.');
        const parentId = sourceFolder.parent_id ? folderMap.get(String(sourceFolder.parent_id)) ?? null : null;
        const baseName = safeName(sourceFolder.name, 'Imported folder', 100);
        let name = baseName;
        let suffix = 2;
        let key = (parentId ?? 'root') + '|' + name.toLowerCase();
        while (folderNameKeys.has(key)) {
          const ending = ' (Imported ' + suffix++ + ')';
          name = baseName.slice(0, Math.max(1, 100 - ending.length)) + ending;
          key = (parentId ?? 'root') + '|' + name.toLowerCase();
        }
        const newId = crypto.randomUUID();
        const { error: folderError } = await supabase.from('vyral_folders').insert({
          id: newId, vyral_id: vyral.id, user_id: userId, parent_id: parentId, name,
        });
        if (folderError) throw folderError;
        folderMap.set(oldId, newId);
        folderNameKeys.add(key);
        createdFolderIds.push(newId);
      }

      const assetMap = new Map<string, string>();
      const versionMap = new Map<string, string>();
      for (const version of manifest.versions) {
        if (typeof version.id === 'string') versionMap.set(version.id, crypto.randomUUID());
      }
      const versionsByAsset = new Map<string, typeof manifest.versions>();
      for (const version of manifest.versions) {
        const assetId = String(version.asset_id ?? '');
        const group = versionsByAsset.get(assetId) ?? [];
        group.push(version);
        versionsByAsset.set(assetId, group);
      }

      const importedDnaSources = new Map<string, { version_id: string; sha256: string; size_bytes: number; mime_type: string; tile_storage_paths: string[]; file_dna_record?: VyralFileDnaRecord }>();
      let completedAssets = 0;
      for (const sourceAsset of importAssets) {
        const oldAssetId = stringValue(sourceAsset.id);
        if (!oldAssetId) throw new Error('A package asset is missing its identity.');
        const assetId = crypto.randomUUID();
        assetMap.set(oldAssetId, assetId);
        const sourceVersions = [...(versionsByAsset.get(oldAssetId) ?? [])].sort((a, b) => Number(a.version_number) - Number(b.version_number));
        const sourceDnaEntry = manifest.dnaRecords.find((record) =>
          record.dna_schema_id === 'vyra.asset-dna' && record.dna_schema_version === 3 && record.asset_id === oldAssetId
        );
        const sourceFileDnaEntry = manifest.dnaRecords.find((record) =>
          record.dna_schema_id === 'vyra.asset-file-dna' && record.dna_schema_version === 1 && record.asset_id === oldAssetId
        );
        const preparedVersions: {
          source: (typeof sourceVersions)[number];
          bytes: Uint8Array;
          sha256: string;
          id: string;
          storagePath: string;
          versionNumber: number;
        }[] = [];
        let reconstructedFromDnaV3 = false;
        let reconstructedFromFileDna = false;
        let reconstructedSourceSha256: string | null = null;

        if (!sourceVersions.length && manifest.exportMode === 'dna-only' && sourceDnaEntry) {
          const dnaEntry = sourceDnaEntry;
          if (!dnaEntry) throw new Error('The DNA-only package has no v3 record for its selected asset.');
          const reconstruction = await encodeVyralDnaV3PngFromPackage(archiveFiles, String(dnaEntry.id));
          const pngBytes = reconstruction.pngBytes;
          const digestBuffer = new ArrayBuffer(pngBytes.byteLength);
          new Uint8Array(digestBuffer).set(pngBytes);
          const digest = await crypto.subtle.digest('SHA-256', digestBuffer);
          const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
          const versionId = crypto.randomUUID();
          const filenameBase = safeName(sourceAsset.original_filename ?? sourceAsset.name, 'reconstructed-image', 120).replace(/\.[^.]+$/, '');
          const filename = filenameBase + '.reconstructed.png';
          const pngBuffer = new ArrayBuffer(pngBytes.byteLength);
          new Uint8Array(pngBuffer).set(pngBytes);
          if (importAssets.length === 1) reconstructionDownload = { blob: new Blob([pngBuffer], { type: 'image/png' }), filename };
          const storagePath = userId + '/' + vyral.id + '/' + assetId + '/v1/' + versionId + '-' + encodeURIComponent(filename);
          const syntheticSource = {
            id: versionId,
            asset_id: oldAssetId,
            version_number: 1,
            package_path: '',
            mime_type: 'image/png',
            source_kind: 'restored',
            metadata: {
              reconstruction_method: 'vyra-dna-v3-raw-tiled-v1',
              decoded_samples_sha256: reconstruction.decoded_samples_sha256,
              original_encoded_source_sha256: asRecord(dnaEntry.dna_record).source && asRecord(asRecord(dnaEntry.dna_record).source).sha256,
              original_encoded_source_bytes_recovered: false,
            },
          } as (typeof sourceVersions)[number];
          preparedVersions.push({ source: syntheticSource, bytes: pngBytes, sha256, id: versionId, storagePath, versionNumber: 1 });
          reconstructedFromDnaV3 = true;
          reconstructedSourceSha256 = String(asRecord(asRecord(dnaEntry.dna_record).source).sha256 ?? '');
        } else if (!sourceVersions.length && manifest.exportMode === 'dna-only' && sourceFileDnaEntry) {
          const fileRecord = asRecord(sourceFileDnaEntry.dna_record);
          const fileMeta = asRecord(fileRecord.file);
          const restoredBytes = await reconstructVyralFileDnaFromPackage(archiveFiles, String(sourceFileDnaEntry.id));
          if (restoredBytes.byteLength > 100 * 1024 * 1024) throw new Error('A reconstructed source file exceeds the 100 MB storage limit.');
          const digestBuffer = new ArrayBuffer(restoredBytes.byteLength);
          new Uint8Array(digestBuffer).set(restoredBytes);
          const digest = await crypto.subtle.digest('SHA-256', digestBuffer);
          const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
          if (sha256 !== String(fileMeta.sha256 ?? '').toLowerCase()) throw new Error('Reconstructed source bytes failed their File DNA SHA-256 check.');
          const versionId = crypto.randomUUID();
          const originalFilename = safeName(sourceAsset.original_filename ?? sourceAsset.name, 'restored-file', 120);
          const storagePath = userId + '/' + vyral.id + '/' + assetId + '/v1/' + versionId + '-' + encodeURIComponent(originalFilename);
          const mimeType = safeMimeType(fileMeta.mime_type, 'application/octet-stream');
          const syntheticSource = {
            id: versionId, asset_id: oldAssetId, version_number: 1, package_path: '',
            mime_type: mimeType, source_kind: 'restored',
            metadata: { reconstruction_method: 'vyra-file-dna-v1-lossless-chunks', original_source_sha256: sha256, original_source_bytes_recovered: true },
          } as (typeof sourceVersions)[number];
          preparedVersions.push({ source: syntheticSource, bytes: restoredBytes, sha256, id: versionId, storagePath, versionNumber: 1 });
          reconstructedFromFileDna = true;
          reconstructedSourceSha256 = sha256;
        } else {
          if (!sourceVersions.length) throw new Error('Asset "' + stringValue(sourceAsset.name, oldAssetId) + '" has no media version in the package.');
          for (const sourceVersion of sourceVersions) {
            const packagePath = sourceVersion.package_path;
            const bytes = typeof packagePath === 'string' ? archiveFiles.get(packagePath) : undefined;
            if (!bytes) throw new Error('A media version is missing from the package archive.');
            if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('An asset version exceeds the 100 MB storage limit.');
            const importDigestBuffer = new ArrayBuffer(bytes.byteLength);
            new Uint8Array(importDigestBuffer).set(bytes);
            const digest = await crypto.subtle.digest('SHA-256', importDigestBuffer);
            const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
            if (typeof sourceVersion.sha256 === 'string' && sourceVersion.sha256.toLowerCase() !== sha256) {
              throw new Error('Integrity verification failed for "' + stringValue(sourceAsset.name, oldAssetId) + '". The package media does not match its SHA-256 record.');
            }
            const versionNumber = Math.max(1, Math.floor(Number(sourceVersion.version_number) || 1));
            const versionId = versionMap.get(String(sourceVersion.id)) ?? crypto.randomUUID();
            const filename = safeName(sourceAsset.original_filename ?? sourceAsset.name, 'asset.bin', 120);
            const storagePath = userId + '/' + vyral.id + '/' + assetId + '/v' + versionNumber + '/' + versionId + '-' + encodeURIComponent(filename);
            preparedVersions.push({ source: sourceVersion, bytes, sha256, id: versionId, storagePath, versionNumber });
          }
        }

        const latest = preparedVersions[preparedVersions.length - 1];
        const mimeType = reconstructedFromDnaV3 ? 'image/png' : safeMimeType(sourceAsset.mime_type, 'application/octet-stream');
        const pendingDnaTileUploads: { storagePath: string; bytes: Uint8Array }[] = [];
        if (sourceDnaEntry || sourceFileDnaEntry) {
          const isFileDna = Boolean(sourceFileDnaEntry);
          const sourceDnaRecord = asRecord((sourceDnaEntry ?? sourceFileDnaEntry)!.dna_record);
          const sourceDnaRecordSource = asRecord(sourceDnaRecord.source);
          const sourceVersion = preparedVersions.find((item) => item.source.id === String(sourceDnaRecordSource.asset_version_id ?? '')) ?? latest;
          const tileStoragePaths: string[] = [];
          if (sourceDnaEntry) {
            const losslessPayload = asRecord(sourceDnaRecord.lossless_payload);
            const tiles = Array.isArray(losslessPayload.tiles) ? losslessPayload.tiles : [];
            for (let index = 0; index < tiles.length; index += 1) {
              const tile = asRecord(tiles[index]);
              const packagePath = stringValue(tile.package_path);
              const tileBytes = archiveFiles.get(packagePath);
              if (!packagePath || !tileBytes || tileBytes.byteLength !== Number(tile.byte_length)) throw new Error('A DNA v3 tile is missing or has an invalid byte length during import.');
              const tileFilename = packagePath.split('/').pop() ?? ('tile-' + index + '.raw');
              const tileStoragePath = userId + '/' + vyral.id + '/' + assetId + '/dna/v3/' + encodeURIComponent(String(sourceDnaRecord.record_id)) + '/' + index + '-' + encodeURIComponent(tileFilename);
              pendingDnaTileUploads.push({ storagePath: tileStoragePath, bytes: tileBytes });
              tileStoragePaths.push(tileStoragePath);
            }
          }
          const importedFileDna = isFileDna ? await createVyralFileDnaV1({
            record_id: crypto.randomUUID(),
            source: { asset_id: assetId, asset_version_id: sourceVersion.id },
            bytes: sourceVersion.bytes,
            mime_type: typeof sourceVersion.source.mime_type === 'string' ? sourceVersion.source.mime_type : mimeType,
            filename: safeName(sourceAsset.original_filename ?? sourceAsset.name, 'Imported asset', 255),
            include_payload: false,
          }) : null;
          importedDnaSources.set(oldAssetId, {
            version_id: sourceVersion.id,
            sha256: sourceVersion.sha256,
            size_bytes: sourceVersion.bytes.byteLength,
            mime_type: safeMimeType(sourceVersion.source.mime_type, reconstructedFromDnaV3 ? 'image/png' : mimeType),
            tile_storage_paths: tileStoragePaths,
            ...(importedFileDna ? { file_dna_record: importedFileDna.record } : {}),
          });
        }
        const assetName = safeName(sourceAsset.name, 'Imported asset', 180);
        const originalFilename = reconstructedFromDnaV3
          ? safeName(sourceAsset.original_filename ?? sourceAsset.name, 'reconstructed-image', 120).replace(/\.[^.]+$/, '') + '.reconstructed.png'
          : safeName(sourceAsset.original_filename ?? sourceAsset.name, assetName, 255);
        const assetTypeValue = reconstructedFromDnaV3 ? 'image' : stringValue(sourceAsset.asset_type, 'other');
        const assetTypeValueSafe = allowedAssetTypes.includes(assetTypeValue) ? assetTypeValue : 'other';
        const { error: assetError } = await supabase.from('vyral_assets').insert({
          id: assetId,
          vyral_id: vyral.id,
          user_id: userId,
          folder_id: sourceAsset.folder_id ? folderMap.get(String(sourceAsset.folder_id)) ?? null : null,
          name: assetName,
          original_filename: originalFilename,
          asset_type: assetTypeValueSafe,
          mime_type: mimeType,
          size_bytes: latest.bytes.byteLength,
          storage_path: latest.storagePath,
          sha256: latest.sha256,
          processing_status: 'uploading',
          description: stringValue(sourceAsset.description).slice(0, 2000),
          license_override: objectValue(sourceAsset.license_override),
          metadata: { ...objectValue(sourceAsset.metadata), visibility: 'private', identity_name_origin: objectValue(sourceAsset.metadata).identity_name_origin ?? 'creator_confirmed', identity_description_origin: objectValue(sourceAsset.metadata).identity_description_origin ?? (stringValue(sourceAsset.description).trim() ? 'creator_confirmed' : 'system_default'), imported_from_package: manifest.packageId, imported_original_asset_id: oldAssetId, imported_original_created_at: sourceAsset.created_at ?? null, imported_original_updated_at: sourceAsset.updated_at ?? null, ...(reconstructedFromDnaV3 ? { reconstructed_from_dna_v3: true, original_encoded_source_sha256: reconstructedSourceSha256, original_encoded_source_bytes_recovered: false } : {}), ...(reconstructedFromFileDna ? { reconstructed_from_file_dna_v1: true, original_source_sha256: reconstructedSourceSha256, original_source_bytes_recovered: true } : {}) },
        });
        if (assetError) throw assetError;
        createdAssetIds.push(assetId);
        for (const tileUpload of pendingDnaTileUploads) {
          const tileBuffer = new ArrayBuffer(tileUpload.bytes.byteLength);
          new Uint8Array(tileBuffer).set(tileUpload.bytes);
          const { error: tileUploadError } = await supabase.storage.from('vyral-assets').upload(
            tileUpload.storagePath,
            new Blob([tileBuffer], { type: 'application/octet-stream' }),
            { contentType: 'application/octet-stream', upsert: false, cacheControl: '3600' },
          );
          if (tileUploadError) throw tileUploadError;
          uploadedPaths.push(tileUpload.storagePath);
        }

        const versionRows: Record<string, unknown>[] = [];
        const fingerprintRows: Record<string, unknown>[] = [];
        for (const item of preparedVersions) {
          const versionMimeType = safeMimeType(item.source.mime_type, mimeType);
          const versionBuffer = new ArrayBuffer(item.bytes.byteLength);
          new Uint8Array(versionBuffer).set(item.bytes);
          const { error: uploadError } = await supabase.storage.from('vyral-assets').upload(item.storagePath, new Blob([versionBuffer], { type: versionMimeType }), {
            contentType: versionMimeType, upsert: false, cacheControl: '3600',
          });
          if (uploadError) throw uploadError;
          uploadedPaths.push(item.storagePath);
          versionRows.push({
            id: item.id,
            asset_id: assetId,
            vyral_id: vyral.id,
            user_id: userId,
            version_number: item.versionNumber,
            storage_path: item.storagePath,
            mime_type: versionMimeType,
            size_bytes: item.bytes.byteLength,
            sha256: item.sha256,
            source_kind: allowedVersionSources.includes(String(item.source.source_kind)) ? item.source.source_kind : 'restored',
            parent_version_id: item.source.parent_version_id ? versionMap.get(String(item.source.parent_version_id)) ?? null : null,
            metadata: { ...objectValue(item.source.metadata), imported_from_package: manifest.packageId, imported_original_created_at: item.source.created_at ?? null, ...(reconstructedFromDnaV3 ? { reconstructed_from_dna_v3: true, original_encoded_source_sha256: reconstructedSourceSha256, original_encoded_source_bytes_recovered: false } : {}) },
          });
          fingerprintRows.push({
            asset_id: assetId,
            asset_version_id: item.id,
            user_id: userId,
            fingerprint_kind: 'cryptographic',
            algorithm: 'SHA-256',
            value: item.sha256,
            metadata: { computed_by: 'browser_web_crypto', verification_status: 'unverified', source: 'package_import' },
          });
        }
        for (let index = 0; index < versionRows.length; index += 100) {
          const { error: versionError } = await supabase.from('vyral_asset_versions').insert(versionRows.slice(index, index + 100));
          if (versionError) throw versionError;
        }
        for (let index = 0; index < fingerprintRows.length; index += 100) {
          const { error: fingerprintError } = await supabase.from('vyral_fingerprints').insert(fingerprintRows.slice(index, index + 100));
          if (fingerprintError) throw fingerprintError;
        }
        const { error: readyError } = await supabase.from('vyral_assets').update({ processing_status: 'ready' }).eq('id', assetId);
        if (readyError) throw readyError;
        // Re-analyze imported media when possible, preserving creator-authored details from the package.
        // Metadata is optional and must never block a valid import or DNA restoration.
        try {
          const accessToken = await getCurrentAccessToken();
          if (accessToken) {
            const importedBuffer = new ArrayBuffer(latest.bytes.byteLength);
            new Uint8Array(importedBuffer).set(latest.bytes);
            const importedFile = new File([importedBuffer], originalFilename, { type: mimeType });
            const sourceMetadata = objectValue(sourceAsset.metadata);
            const suggestion = await suggestVyralAssetDetails(importedFile, {
              accessToken, assetType: assetTypeValueSafe, sourceVersionId: latest.id, sourceRevision: latest.versionNumber,
              currentDetails: sourceMetadata.ai_details,
            });
            const { data: currentAsset } = await supabase.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', userId).maybeSingle();
            const currentMetadata = currentAsset?.metadata && typeof currentAsset.metadata === 'object' && !Array.isArray(currentAsset.metadata)
              ? currentAsset.metadata as Record<string, unknown> : {};
            const aiSuggestions = Object.fromEntries(Object.entries(suggestion.details.fields)
              .filter(([, field]) => field.origin === 'ai_suggested')
              .map(([key, field]) => [key, { value: field.value, ...(field.confidence === undefined ? {} : { confidence: field.confidence }) }]));
            const mergedDetails = mergeVyralAiDetails(currentMetadata.ai_details, {
              scope: 'asset', sourceVersionId: latest.id, sourceRevision: latest.versionNumber,
              provider: suggestion.provider, model: suggestion.model,
              generatedAt: suggestion.details.generated_at, suggestions: aiSuggestions,
            });
            const fields = mergedDetails.fields;
            const suggestedName = typeof fields.name?.value === 'string' ? fields.name.value.trim().slice(0, 100) : '';
            const suggestedDescription = typeof fields.description?.value === 'string' ? fields.description.value.trim().slice(0, 1000) : '';
            const { error: metadataError } = await supabase.from('vyral_assets').update({
              ...(suggestedName && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_name_origin ?? 'system_default')) ? { name: suggestedName } : {}),
              ...(suggestedDescription && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_description_origin ?? 'system_default')) ? { description: suggestedDescription } : {}),
              metadata: {
                ...currentMetadata, ai_details: mergedDetails, ai_details_status: 'ready',
                ai_details_source_version_id: latest.id,
                ...(suggestedName && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_name_origin ?? 'system_default')) ? { identity_name_origin: 'ai_suggested' } : {}),
                ...(suggestedDescription && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_description_origin ?? 'system_default')) ? { identity_description_origin: 'ai_suggested' } : {}),
              },
            }).eq('id', assetId).eq('user_id', userId);
            if (metadataError) console.warn('[vyral-ai-details] Could not save imported Asset suggestions.');
          } else {
            const { data: importedAsset } = await supabase.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', userId).maybeSingle();
            if (importedAsset) {
              const importedMetadata = importedAsset.metadata && typeof importedAsset.metadata === 'object' && !Array.isArray(importedAsset.metadata)
                ? importedAsset.metadata as Record<string, unknown> : {};
              await supabase.from('vyral_assets').update({
                metadata: { ...importedMetadata, ...(importedMetadata.ai_details && typeof importedMetadata.ai_details === 'object' ? { ai_details: markVyralAiDetailsStale(importedMetadata.ai_details as VyralAiDetails) } : {}), ai_details_status: 'unavailable', visibility: 'private' },
              }).eq('id', assetId).eq('user_id', userId);
            }
          }
        } catch (metadataCause) {
          console.warn('[vyral-ai-details] Imported Asset suggestions were unavailable.', metadataCause);
          const { data: currentAsset } = await supabase.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', userId).maybeSingle();
          if (currentAsset) {
            const currentMetadata = currentAsset.metadata && typeof currentAsset.metadata === 'object' && !Array.isArray(currentAsset.metadata)
              ? currentAsset.metadata as Record<string, unknown> : {};
            await supabase.from('vyral_assets').update({ metadata: { ...currentMetadata, ...(currentMetadata.ai_details && typeof currentMetadata.ai_details === 'object' ? { ai_details: markVyralAiDetailsStale(currentMetadata.ai_details as VyralAiDetails) } : {}), ai_details_status: 'unavailable' } })
              .eq('id', assetId).eq('user_id', userId);
          }
        }
        completedAssets += 1;
        setPackageStatus('Restoring assets ' + completedAssets + ' / ' + importAssets.length + '…');
      }

      const dnaRows: Record<string, unknown>[] = [];
      const addImportedEvidence = (sourceKind: string, assetId: string | null, payload: Record<string, unknown>, reconstructionData: Record<string, unknown> = {}, schemaVersion = 1, recordId?: string) => {
        dnaRows.push({
          ...(recordId ? { id: recordId } : {}),
          vyral_id: vyral.id,
          user_id: userId,
          asset_id: assetId,
          scope: assetId ? 'asset' : 'vyral',
          schema_version: schemaVersion,
          dna_status: 'evolving',
          source_kind: allowedDnaSources.includes(sourceKind) ? sourceKind : 'system',
          verification_status: 'unverified',
          payload: { ...payload, package_id: manifest.packageId, import_run_id: importRunId, trust: 'unverified_imported_evidence' },
          reconstruction_data: reconstructionData,
        });
      };

      for (const sourceRecord of manifest.dnaRecords) {
        const oldAssetId = sourceRecord.asset_id ? String(sourceRecord.asset_id) : '';
        if (oldAssetId && !importAssetIds.has(oldAssetId)) continue;
        const assetId = oldAssetId ? assetMap.get(oldAssetId) ?? null : null;
        if (oldAssetId && !assetId) throw new Error('Package DNA evidence references an Asset outside the import inventory.');
        const isDnaV3Record = sourceRecord.dna_schema_id === 'vyra.asset-dna' && sourceRecord.dna_schema_version === 3;
        const isFileDnaRecord = sourceRecord.dna_schema_id === 'vyra.asset-file-dna' && sourceRecord.dna_schema_version === 1;
        const originalPayload = isDnaV3Record || isFileDnaRecord
          ? { dna_schema_id: sourceRecord.dna_schema_id, dna_schema_version: sourceRecord.dna_schema_version, dna_record: sourceRecord.dna_record, recovery_level: sourceRecord.recovery_level }
          : objectValue(sourceRecord.payload);
        const originalDnaRecord = isDnaV3Record || isFileDnaRecord ? objectValue(sourceRecord.dna_record) : {};
        const originalDnaSource = objectValue(originalDnaRecord.source);
        const importedDnaSource = importedDnaSources.get(oldAssetId);
        const remappedDnaRecordId = isDnaV3Record ? crypto.randomUUID() : (isFileDnaRecord ? importedDnaSource?.file_dna_record?.record_id : undefined);
        const remappedFileDnaRecord = isFileDnaRecord ? importedDnaSource?.file_dna_record : undefined;
        const originalLosslessPayload = objectValue(originalDnaRecord.lossless_payload);
        const originalTiles = Array.isArray(originalLosslessPayload.tiles) ? originalLosslessPayload.tiles : [];
        const remappedDnaRecord = isDnaV3Record ? {
          ...originalDnaRecord,
          record_id: remappedDnaRecordId,
          source: {
            ...originalDnaSource,
            asset_id: assetId,
            asset_version_id: importedDnaSource?.version_id ?? versionMap.get(String(originalDnaSource.asset_version_id ?? '')) ?? originalDnaSource.asset_version_id,
            sha256: importedDnaSource?.sha256 ?? originalDnaSource.sha256,
            size_bytes: importedDnaSource?.size_bytes ?? originalDnaSource.size_bytes,
            mime_type: importedDnaSource?.mime_type ?? originalDnaSource.mime_type,
          },
          lossless_payload: {
            ...originalLosslessPayload,
            tiles: originalTiles.map((value) => {
              const tile = objectValue(value);
              return { ...tile, package_path: 'dna/v3/' + String(remappedDnaRecordId) + '/tiles/' + String(tile.x) + '_' + String(tile.y) + '.raw' };
            }),
          },
        } : null;
        addImportedEvidence(stringValue(sourceRecord.source_kind, 'system'), assetId, {
          ...originalPayload,
          ...(isDnaV3Record ? { dna_record: remappedDnaRecord, tile_storage_paths: importedDnaSource?.tile_storage_paths ?? [] } : {}),
          ...(isFileDnaRecord && remappedFileDnaRecord ? {
            dna_schema_id: 'vyra.asset-file-dna',
            dna_schema_version: 1,
            dna_record: remappedFileDnaRecord,
            source_version_id: importedDnaSource?.version_id,
            source_file_sha256: importedDnaSource?.sha256,
            extraction_kind: 'deterministic_binary_file_identity',
          } : {}),
          imported_provenance: {
            ...(isDnaV3Record || isFileDnaRecord ? {
              original_dna_record_id: sourceRecord.id ?? null,
              original_source: originalDnaSource,
              reconstructed_asset_sha256: importedDnaSource?.sha256 ?? null,
              original_encoded_source_bytes_recovered: isFileDnaRecord,
            } : {}),
            package_id: manifest.packageId,
            import_run_id: importRunId,
            original_record_id: sourceRecord.id ?? null,
            claimed_dna_status: sourceRecord.dna_status ?? null,
            claimed_verification_status: sourceRecord.verification_status ?? null,
            original_created_at: sourceRecord.created_at ?? null,
            trust: 'unverified_imported_evidence',
          },
        }, isFileDnaRecord ? {
          source_preservation: 'original_binary_retained',
          reconstruction_ready: false,
          recovery_level: 'identity-only',
          encoded_source_bytes_recoverable: false,
        } : objectValue(sourceRecord.reconstruction_data), isDnaV3Record ? 3 : 1, remappedDnaRecordId);
      }

      for (const sourceFingerprint of manifest.fingerprints) {
        if (sourceFingerprint.fingerprint_kind === 'cryptographic' && sourceFingerprint.algorithm === 'SHA-256') continue;
        const assetId = assetMap.get(String(sourceFingerprint.asset_id ?? ''));
        if (!assetId) continue;
        addImportedEvidence('system', assetId, {
          imported_fingerprint_claim: sourceFingerprint,
          trust: 'unverified_imported_evidence',
        });
      }
      for (const observation of manifest.visionObservations) {
        const assetId = assetMap.get(String(observation.asset_id ?? ''));
        if (!assetId) continue;
        addImportedEvidence('vision', assetId, {
          imported_vision_observation: observation,
          trust: 'unverified_imported_evidence',
        });
      }
      for (const reconstruction of manifest.reconstructionTests) {
        const assetId = assetMap.get(String(reconstruction.asset_id ?? ''));
        if (!assetId) continue;
        addImportedEvidence('verification', assetId, {
          imported_reconstruction_claim: reconstruction,
          trust: 'unverified_imported_evidence',
        });
      }
      // DNA-only packages are strict Asset reconstruction units. Do not add a
      // synthetic Vyral-scope evidence row to the same import run: it is not an
      // Asset reconstruction record and can violate the one-record-per-Asset
      // import contract enforced by downstream package validation.
      if (manifest.exportMode !== 'dna-only') {
        addImportedEvidence('system', null, {
          imported_collection_identity: manifest.vyral,
          package_id: manifest.packageId,
          import_run_id: importRunId,
          exported_at: manifest.exportedAt,
          trust: 'unverified_imported_evidence',
        });
      }

      for (let index = 0; index < dnaRows.length; index += 100) {
        const { error: dnaError } = await supabase.from('vyral_dna_records').insert(dnaRows.slice(index, index + 100));
        if (dnaError) throw dnaError;
      }

      // Optional creator context is preserved when present. It never determines
      // whether an Asset or Vyral is valid, and no synthetic membership edge is created.
      if (importedMasterDna && masterDnaAvailable) {
        for (const sourceAsset of importedMasterDna.assets) {
          if (!importAssetIds.has(sourceAsset.asset_id)) continue;
          const importedAssetId = assetMap.get(sourceAsset.asset_id);
          if (!importedAssetId) {
            throw new Error('Imported Master DNA references an Asset outside its inventory.');
          }
          const role = sourceAsset.role ?? null;
          const purpose = sourceAsset.purpose ?? null;
          if (role !== null || purpose !== null) {
            const { error: contextError } = await supabase.rpc('set_vyral_master_dna_asset_context', {
              p_asset_id: importedAssetId,
              p_role: role,
              p_purpose: purpose,
            });
            if (contextError) throw contextError;
          }
        }

        const importedRelationships = importedMasterDna.relationships ?? [];
        const relationshipRows = importedRelationships.flatMap((relation) => {
          const fromExcluded = relation.from.kind === 'asset' && manifestAssetIds.has(relation.from.asset_id) && !importAssetIds.has(relation.from.asset_id);
          const toExcluded = relation.to.kind === 'asset' && manifestAssetIds.has(relation.to.asset_id) && !importAssetIds.has(relation.to.asset_id);
          if (fromExcluded || toExcluded) return [];
          const fromAssetId = relation.from.kind === 'asset' ? assetMap.get(relation.from.asset_id) : null;
          const toAssetId = relation.to.kind === 'asset' ? assetMap.get(relation.to.asset_id) : null;
          if ((relation.from.kind === 'asset' && !fromAssetId) || (relation.to.kind === 'asset' && !toAssetId)) {
            throw new Error('An imported Master DNA relationship references an Asset outside its inventory.');
          }
          return [{
            vyral_id: vyral.id,
            user_id: userId,
            relationship_type: relation.type,
            from_kind: relation.from.kind,
            from_asset_id: fromAssetId,
            to_kind: relation.to.kind,
            to_asset_id: toAssetId,
            rationale: relation.rationale,
            evidence_ref: relation.evidence_ref ?? null,
            metadata: { imported_from_package: manifest.packageId, imported_relationship_id: relation.relationship_id, trust: 'unverified_imported_evidence' },
          }];
        });
        for (let index = 0; index < relationshipRows.length; index += 100) {
          const { error: relationshipError } = await supabase.from('vyral_asset_relationships').insert(relationshipRows.slice(index, index + 100));
          if (relationshipError) throw relationshipError;
        }
      }

      const lineageRows = manifest.lineage.flatMap((item) => {
        const parentId = assetMap.get(String(item.parent_asset_id ?? ''));
        const childId = assetMap.get(String(item.child_asset_id ?? ''));
        const relation = String(item.relation_kind ?? '');
        return parentId && childId && parentId !== childId && allowedRelations.includes(relation) ? [{
          vyral_id: vyral.id,
          user_id: userId,
          parent_asset_id: parentId,
          child_asset_id: childId,
          relation_kind: relation,
          metadata: { ...objectValue(item.metadata), imported_from_package: manifest.packageId, imported_original_created_at: item.created_at ?? null },
        }] : [];
      });
      for (let index = 0; index < lineageRows.length; index += 100) {
        const { error: lineageError } = await supabase.from('vyral_lineage').insert(lineageRows.slice(index, index + 100));
        if (lineageError) throw lineageError;
      }

      // Carry source collection details into an empty/default destination only.
      // Existing destination creator choices always take precedence; the merged inventory is re-analyzed below.
      const sourceVyral = objectValue(manifest.vyral);
      const hasCollectionMetadata = Object.prototype.hasOwnProperty.call(sourceVyral, 'metadata');
      const sourceVyralMetadata = objectValue(sourceVyral.metadata);
      const targetVyralMetadata = objectValue(vyral.metadata);
      const sourceAiDetails = objectValue(sourceVyralMetadata.ai_details);
      const hasSourceAiDetails = sourceAiDetails.schema_version === 1 && objectValue(sourceAiDetails.fields);
      const targetHasAiDetails = Boolean(targetVyralMetadata.ai_details);
      const sourceName = safeName(sourceVyral.name, '', 100);
      const sourceDescription = stringValue(sourceVyral.description).trim().slice(0, 1000);
      const targetNameIsDefault = targetVyralMetadata.identity_name_origin === 'system_default';
      const targetDescriptionIsDefault = targetVyralMetadata.identity_description_origin === 'system_default';
      const sourceNameOrigin = ['system_default', 'ai_suggested', 'creator_confirmed', 'creator_edited'].includes(String(sourceVyralMetadata.identity_name_origin))
        ? String(sourceVyralMetadata.identity_name_origin) : 'creator_confirmed';
      const sourceDescriptionOrigin = ['system_default', 'ai_suggested', 'creator_confirmed', 'creator_edited'].includes(String(sourceVyralMetadata.identity_description_origin))
        ? String(sourceVyralMetadata.identity_description_origin) : (sourceDescription ? 'creator_confirmed' : 'system_default');
      if ((!assets.length && !targetHasAiDetails && hasSourceAiDetails) || (hasCollectionMetadata && targetNameIsDefault && sourceName) || (hasCollectionMetadata && targetDescriptionIsDefault && sourceDescription)) {
        const nextVyralMetadata = {
          ...targetVyralMetadata,
          ...(!assets.length && !targetHasAiDetails && hasSourceAiDetails ? {
            ai_details: { ...sourceAiDetails, stale: true },
            ai_details_status: 'pending',
            ai_details_imported_from_package: manifest.packageId,
          } : {}),
          ...(hasCollectionMetadata && targetNameIsDefault && sourceName ? { identity_name_origin: sourceNameOrigin } : {}),
          ...(hasCollectionMetadata && targetDescriptionIsDefault && sourceDescription ? { identity_description_origin: sourceDescriptionOrigin } : {}),
        };
        const { error: collectionIdentityError } = await supabase.from('vyrals').update({
          ...(hasCollectionMetadata && targetNameIsDefault && sourceName ? { name: sourceName } : {}),
          ...(hasCollectionMetadata && targetDescriptionIsDefault && sourceDescription ? { description: sourceDescription } : {}),
          metadata: nextVyralMetadata,
        }).eq('id', vyral.id).eq('user_id', userId);
        if (collectionIdentityError) throw collectionIdentityError;
        onVyralUpdated({
          ...(targetNameIsDefault && sourceName ? { name: sourceName } : {}),
          ...(targetDescriptionIsDefault && sourceDescription ? { description: sourceDescription } : {}),
          metadata: nextVyralMetadata,
        });
      }

      await loadWorkspace();
      setReconstructedPngDownload(reconstructionDownload);
      setPackageStatus('Imported ' + assetCount + ' assets, ' + folderCount + ' folders and their identity evidence.' + (skippedNestedPackageCount ? ' Skipped ' + skippedNestedPackageCount + ' nested Vyral package file(s).' : '') + (reconstructionDownload ? ' DNA v3 decoded samples were restored into a new PNG; original encoded file bytes were not recovered.' : '') + (importedMasterDna && masterDnaAvailable ? ' Optional creator context was preserved where supplied.' : importedMasterDna ? ' Collection context is preserved in the package; this destination does not have the latest context migration yet.' : ''));
    } catch (cause) {
      const cleanupFailures: string[] = [];
      if (importPackageId && importUserId) {
        const importedEvidence = await supabase.from('vyral_dna_records').delete().eq('vyral_id', vyral.id).eq('user_id', importUserId).contains('payload', { import_run_id: importRunId });
        if (importedEvidence.error) cleanupFailures.push('Imported DNA evidence cleanup: ' + importedEvidence.error.message);
      }
      if (uploadedPaths.length) {
        for (let index = 0; index < uploadedPaths.length; index += 100) {
          const { error: cleanupError } = await supabase.storage.from('vyral-assets').remove(uploadedPaths.slice(index, index + 100));
          if (cleanupError) cleanupFailures.push('Stored media cleanup: ' + cleanupError.message);
        }
      }
      for (let index = 0; index < createdAssetIds.length; index += 100) {
        const { error: cleanupError } = await supabase.from('vyral_assets').delete().in('id', createdAssetIds.slice(index, index + 100));
        if (cleanupError) cleanupFailures.push('Asset-record cleanup: ' + cleanupError.message);
      }
      for (let index = 0; index < createdFolderIds.length; index += 100) {
        const { error: cleanupError } = await supabase.from('vyral_folders').delete().in('id', createdFolderIds.slice(index, index + 100));
        if (cleanupError) cleanupFailures.push('Folder cleanup: ' + cleanupError.message);
      }
      await loadWorkspace();
      const primaryError = cause instanceof Error ? cause.message : 'VYRAL package import failed.';
      setError(primaryError + (cleanupFailures.length ? ' Cleanup needs attention: ' + cleanupFailures.join(' · ') : ' Newly created package records were rolled back.'));
      setReconstructedPngDownload(null);
      setPackageStatus('');
    } finally {
      setPackageBusy(false);
    }
  };

  const importVyralPackageFromAsset = async (asset: AssetRow) => {
    if (!supabase || packageBusy || busy) return;
    setError('');
    setPackageStatus('Reading uploaded .vyral from Asset storage…');
    const sourceVersion = versions
      .filter((version) => version.asset_id === asset.id)
      .find((version) => version.storage_path === asset.storage_path)
      ?? versions.filter((version) => version.asset_id === asset.id)
        .sort((left, right) => right.version_number - left.version_number)[0];
    if (!sourceVersion?.sha256 || !sourceVersion.storage_path || sourceVersion.storage_path !== asset.storage_path) {
      setPackageStatus('');
      setError('This .vyral upload has no matching, SHA-256-pinned source version. Verify or recover the upload before importing.');
      return;
    }
    const { data, error: downloadError } = await supabase.storage.from('vyral-assets').download(asset.storage_path);
    if (downloadError || !data) {
      setPackageStatus('');
      setError('Could not read this uploaded package from Asset storage: ' + (downloadError?.message ?? 'file missing'));
      return;
    }
    if (data.size !== Number(sourceVersion.size_bytes) || data.size > 100 * 1024 * 1024) {
      setPackageStatus('');
      setError('The uploaded .vyral file size does not match its recorded source version or exceeds the 100 MB import limit.');
      return;
    }
    const packageBuffer = await data.arrayBuffer();
    const packageDigest = await crypto.subtle.digest('SHA-256', packageBuffer);
    const packageSha256 = Array.from(new Uint8Array(packageDigest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (packageSha256 !== sourceVersion.sha256.toLowerCase()) {
      setPackageStatus('');
      setError('The uploaded .vyral file failed its source-version SHA-256 check. Import was stopped to protect package integrity.');
      return;
    }
    const filename = asset.original_filename.toLowerCase().endsWith('.vyral')
      ? asset.original_filename
      : asset.name.toLowerCase().endsWith('.vyral') ? asset.name : asset.name + '.vyral';
    await importVyralPackage(new File([data], filename, { type: VYRAL_PACKAGE_FORMAT }), asset.id);
  };

  const createFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !folderName.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('Please sign in again before creating a folder.'); return; }
    setBusy(true); setError('');
    const { error: insertError } = await supabase.from('vyral_folders').insert({
      vyral_id: vyral.id, user_id: auth.user.id, parent_id: activeFolderId, name: folderName.trim(),
    });
    if (insertError) setError(insertError.message);
    else { setFolderName(''); setFolderDialog(false); await loadWorkspace(); }
    setBusy(false);
  };

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    await uploadFilesFromFiles(selected);
  };

  const uploadFilesFromFiles = async (selected: File[]): Promise<boolean> => {
    if (!supabase || !selected.length) return false;
    const db = supabase;
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) { setError('Your session has expired. Please sign in again.'); return false; }
    setBusy(true); setError('');
    const failures: string[] = [];
    for (const file of selected) {
      if (file.size > 100 * 1024 * 1024) { failures.push(file.name + ' is larger than the 100 MB upload limit.'); continue; }
      let storagePath = '';
      let assetId = '';
      let dnaCommitted = false;
      try {
        const sourceBuffer = await file.arrayBuffer();
        const sourceBytes = new Uint8Array(sourceBuffer);
        const digest = await crypto.subtle.digest('SHA-256', sourceBuffer);
        const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        assetId = crypto.randomUUID();
        storagePath = auth.user.id + '/' + vyral.id + '/' + assetId + '/v1/' + storageObjectFilename(assetId, file);
        const kind = assetType(file);
        const mime = file.type || 'application/octet-stream';
        const { error: assetError } = await supabase.from('vyral_assets').insert({
          id: assetId, vyral_id: vyral.id, user_id: auth.user.id, folder_id: activeFolderId,
          name: file.name, original_filename: file.name, asset_type: kind, mime_type: mime,
          size_bytes: file.size, storage_path: storagePath, sha256, processing_status: 'uploading',
          metadata: { upload_source: 'creator_workspace', hash_algorithm: 'SHA-256', visibility: 'private', ai_details_status: 'pending', identity_name_origin: 'system_default', identity_description_origin: 'system_default' },
        });
        if (assetError) throw assetError;
        const { error: storageError } = await supabase.storage.from('vyral-assets').upload(storagePath, file, {
          contentType: mime, upsert: false, cacheControl: '3600',
        });
        if (storageError) throw storageError;
        const { data: version, error: versionError } = await supabase.from('vyral_asset_versions').insert({
          asset_id: assetId, vyral_id: vyral.id, user_id: auth.user.id, version_number: 1,
          storage_path: storagePath, mime_type: mime, size_bytes: file.size, sha256,
          source_kind: 'original', metadata: { original_filename: file.name },
        }).select('id').single();
        if (versionError || !version?.id) throw versionError ?? new Error('Could not create the original asset version record.');
        const { error: fingerprintError } = await supabase.from('vyral_fingerprints').insert({
          asset_id: assetId, asset_version_id: version.id, user_id: auth.user.id,
          fingerprint_kind: 'cryptographic', algorithm: 'SHA-256', value: sha256,
          metadata: { computed_by: 'browser_web_crypto', verification_status: 'unverified', source: 'original_upload' },
        });
        if (fingerprintError) throw fingerprintError;

        const saveFileDnaIdentity = async (fallbackReason?: string) => {
          const fileDna = await createVyralFileDnaV1({
            record_id: crypto.randomUUID(),
            source: { asset_id: assetId, asset_version_id: version.id },
            bytes: sourceBytes,
            mime_type: mime || 'application/octet-stream',
            filename: file.name,
            include_payload: false,
          });
          if (fileDna.record.file.sha256 !== sha256 || fileDna.record.file.size_bytes !== file.size) {
            throw new Error('Universal File DNA did not match the uploaded source bytes.');
          }
          const { error: dnaError } = await db.from('vyral_dna_records').insert({
            id: fileDna.record.record_id,
            vyral_id: vyral.id, user_id: auth.user.id, asset_id: assetId, scope: 'asset',
            schema_version: 1, dna_status: 'evolving', source_kind: 'system',
            verification_status: 'observed',
            payload: {
              dna_schema_id: 'vyra.asset-file-dna',
              dna_schema_version: 1,
              dna_record: fileDna.record,
              source_version_id: version.id,
              source_file_sha256: sha256,
              extraction_kind: fallbackReason ? 'deterministic_binary_file_identity_fallback' : 'deterministic_binary_file_identity',
              ...(fallbackReason ? { image_dna_v3_fallback_reason: fallbackReason.slice(0, 500) } : {}),
            },
            reconstruction_data: {
              source_preservation: 'original_binary_retained',
              reconstruction_ready: false,
              recovery_level: 'identity-only',
              encoded_source_bytes_recoverable: false,
            },
          });
          if (dnaError) throw dnaError;
          dnaCommitted = true;
        };

        if (kind === 'image' && ['image/png', 'image/jpeg', 'image/webp'].includes(mime.toLowerCase())) {
          const { data: extraction, error: extractionError } = await supabase.functions.invoke('extract-vyral-asset-dna-v3', {
            body: { assetId, versionId: version.id },
          });
          if (extractionError || extraction?.status !== 'extracted') {
            const response = (extractionError as unknown as { context?: Response } | null)?.context;
            let detail = extraction?.error ?? extractionError?.message ?? 'Server-side DNA extraction did not complete.';
            if (response && typeof response.clone === 'function') {
              try {
                const payload = await response.clone().json();
                if (typeof payload?.error === 'string') detail = payload.error;
              } catch { /* Keep the SDK error when the response is not JSON. */ }
            }
            const { data: committedDna, error: reconcileError } = await supabase
              .from('vyral_dna_records')
              .select('id')
              .eq('asset_id', assetId)
              .eq('user_id', auth.user.id)
              .limit(10);
            if (reconcileError) throw reconcileError;
            if ((committedDna?.length ?? 0) > 0) {
              throw new Error('Image DNA extraction may already have committed. Refresh the Asset before retrying.');
            }
            await saveFileDnaIdentity(detail);
          } else {
            dnaCommitted = true;
          }
        } else {
          await saveFileDnaIdentity();
        }
        const { error: readyError } = await supabase.from('vyral_assets').update({ processing_status: 'ready' }).eq('id', assetId);
        if (readyError) throw readyError;
        // AI suggestions are best-effort; upload, DNA, and fingerprints remain valid without them.
        try {
          const accessToken = await getCurrentAccessToken();
          if (accessToken) {
            const suggestion = await suggestVyralAssetDetails(file, {
              accessToken, assetType: kind, sourceVersionId: version.id, sourceRevision: 1,
            });
            const { data: currentAsset } = await db.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', auth.user.id).maybeSingle();
            const currentMetadata = currentAsset?.metadata && typeof currentAsset.metadata === 'object' && !Array.isArray(currentAsset.metadata)
              ? currentAsset.metadata as Record<string, unknown> : {};
            const aiSuggestions = Object.fromEntries(Object.entries(suggestion.details.fields)
              .filter(([, field]) => field.origin === 'ai_suggested')
              .map(([key, field]) => [key, { value: field.value, ...(field.confidence === undefined ? {} : { confidence: field.confidence }) }]));
            const mergedDetails = mergeVyralAiDetails(currentMetadata.ai_details, {
              scope: 'asset', sourceVersionId: version.id, sourceRevision: 1,
              provider: suggestion.provider, model: suggestion.model,
              generatedAt: suggestion.details.generated_at, suggestions: aiSuggestions,
            });
            const fields = mergedDetails.fields;
            const suggestedName = typeof fields.name?.value === 'string' ? fields.name.value.trim().slice(0, 100) : '';
            const suggestedDescription = typeof fields.description?.value === 'string' ? fields.description.value.trim().slice(0, 1000) : '';
            const { error: metadataError } = await db.from('vyral_assets').update({
              ...(suggestedName && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_name_origin ?? 'system_default')) ? { name: suggestedName } : {}),
              ...(suggestedDescription && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_description_origin ?? 'system_default')) ? { description: suggestedDescription } : {}),
              metadata: {
                ...currentMetadata, ai_details: mergedDetails, ai_details_status: 'ready',
                ai_details_source_version_id: version.id,
                ...(suggestedName && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_name_origin ?? 'system_default')) ? { identity_name_origin: 'ai_suggested' } : {}),
                ...(suggestedDescription && ['system_default', 'ai_suggested'].includes(String(currentMetadata.identity_description_origin ?? 'system_default')) ? { identity_description_origin: 'ai_suggested' } : {}),
              },
            }).eq('id', assetId).eq('user_id', auth.user.id);
            if (metadataError) console.warn('[vyral-ai-details] Could not save uploaded Asset suggestions.');
          } else {
            const { data: currentAsset } = await db.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', auth.user.id).maybeSingle();
            if (currentAsset) {
              const currentMetadata = currentAsset.metadata && typeof currentAsset.metadata === 'object' && !Array.isArray(currentAsset.metadata)
                ? currentAsset.metadata as Record<string, unknown> : {};
              await db.from('vyral_assets').update({ metadata: { ...currentMetadata, ai_details_status: 'unavailable' } })
                .eq('id', assetId).eq('user_id', auth.user.id);
            }
          }
        } catch (metadataCause) {
          console.warn('[vyral-ai-details] Uploaded Asset suggestions were unavailable.', metadataCause);
          const { data: currentAsset } = await db.from('vyral_assets').select('metadata').eq('id', assetId).eq('user_id', auth.user.id).maybeSingle();
          if (currentAsset) {
            const currentMetadata = currentAsset.metadata && typeof currentAsset.metadata === 'object' && !Array.isArray(currentAsset.metadata)
              ? currentAsset.metadata as Record<string, unknown> : {};
            await db.from('vyral_assets').update({ metadata: { ...currentMetadata, ai_details_status: 'unavailable' } })
              .eq('id', assetId).eq('user_id', auth.user.id);
          }
        }
      } catch (cause) {
        let preserveCommittedAsset = dnaCommitted;
        if (assetId && !preserveCommittedAsset) {
          const { data: committedRows, error: reconcileError } = await supabase
            .from('vyral_dna_records').select('id,payload').eq('asset_id', assetId).limit(10);
          // A lost response can hide a committed DNA INSERT. Preserve the source
          // and all evidence whenever the database outcome cannot be confirmed.
          if (reconcileError || (committedRows?.length ?? 0) > 0) preserveCommittedAsset = true;
        }
        if (preserveCommittedAsset) {
          failures.push(file.name + ': ' + (cause instanceof Error ? cause.message : 'upload finalization failed.') +
            ' DNA evidence or its commit state was preserved. Refresh the Asset and use Recover DNA to finish the ready state.');
        } else {
          const cleanupErrors: string[] = [];
          if (storagePath) {
            const { error: sourceCleanupError } = await supabase.storage.from('vyral-assets').remove([storagePath]);
            if (sourceCleanupError) cleanupErrors.push('Source file cleanup: ' + sourceCleanupError.message);
          }
          if (assetId) {
            const { error: fingerprintCleanupError } = await supabase.from('vyral_fingerprints').delete().eq('asset_id', assetId);
            if (fingerprintCleanupError) cleanupErrors.push('Fingerprint cleanup: ' + fingerprintCleanupError.message);
            const { error: versionCleanupError } = await supabase.from('vyral_asset_versions').delete().eq('asset_id', assetId);
            if (versionCleanupError) cleanupErrors.push('Version cleanup: ' + versionCleanupError.message);
            const { error: assetCleanupError } = await supabase.from('vyral_assets').delete().eq('id', assetId);
            if (assetCleanupError) cleanupErrors.push('Asset cleanup: ' + assetCleanupError.message);
          }
          failures.push(file.name + ': ' + (cause instanceof Error ? cause.message : 'upload failed.') +
            (cleanupErrors.length ? ' Cleanup needs attention: ' + cleanupErrors.join(' · ') : ' Incomplete upload records were cleaned up.'));
        }
      }
    }
    await loadWorkspace();
    if (failures.length) setError(failures.join(' · '));
    setBusy(false);
    return failures.length === 0;
  };

  const copyReferencedAsset = async (reference: CollectionReferenceRow, assetReference: PublicCollectionAssetReferenceV1) => {
    if (!supabase || busy || packageBusy) return;
    setPackageBusy(true);
    setPackageStatus('Checking permission and downloading the public Asset…');
    setError('');
    try {
      const file = await downloadPublicVyralCollectionAssetV1({
        resolver_uri: reference.resolver_uri,
        source_vyral_id: reference.source_vyral_id,
      }, assetReference);
      setPackageStatus('Source integrity verified. Saving a private copy in this Vyral…');
      const saved = await uploadFilesFromFiles([file]);
      if (!saved) { setPackageStatus('The verified source was downloaded, but the destination copy needs attention.'); return; }
      setPackageStatus('The verified Asset copy was saved privately in this Vyral.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retrieve this public Asset.');
      setPackageStatus('');
    } finally {
      setPackageBusy(false);
    }
  };

  const exportReferencedAssetDna = async (reference: CollectionReferenceRow, assetReference: PublicCollectionAssetReferenceV1) => {
    if (packageBusy || busy) return;
    const mimeType = assetReference.mediaType.toLowerCase();
    const isRaster = ['image/png', 'image/jpeg', 'image/webp'].includes(mimeType);
    setPackageBusy(true);
    setPackageStatus('Preparing an AI-ready file and checking every part…');
    setError('');
    try {
      const resolverReference = {
        resolver_uri: reference.resolver_uri,
        source_vyral_id: reference.source_vyral_id,
      };
      const retrieved = isRaster
        ? await retrievePublicVyralAssetDnaV1(resolverReference, assetReference)
        : await retrievePublicVyralAssetFileDnaV1(resolverReference, assetReference);
      const sourceVyral = asRecord(reference.compact_snapshot.vyral);
      const assetType = mimeType.startsWith('image/') ? 'image'
        : mimeType.startsWith('video/') ? 'video'
          : mimeType.startsWith('audio/') ? 'audio'
            : mimeType.includes('pdf') || mimeType.includes('text') ? 'document' : 'file';
      const baseManifest = {
        format: VYRAL_PACKAGE_FORMAT,
        formatVersion: VYRAL_PACKAGE_VERSION,
        packageId: crypto.randomUUID(),
        exportedAt: new Date().toISOString(),
        exportMode: 'dna-only' as const,
        exportComponents: { assets: false, fullDna: true, compactDna: false },
        vyral: {
          id: reference.source_vyral_id,
          name: typeof sourceVyral.name === 'string' ? sourceVyral.name : 'Referenced Vyral',
        },
        folders: [],
        assets: [{
          id: retrieved.asset.id,
          name: retrieved.asset.name,
          original_filename: retrieved.asset.name,
          asset_type: assetType,
          mime_type: retrieved.asset.mimeType,
          size_bytes: retrieved.asset.sizeBytes,
          sha256: retrieved.asset.sha256,
          metadata: { visibility: 'public' },
        }],
        versions: [],
        dnaRecords: [],
        fingerprints: [],
        visionObservations: [],
        lineage: [],
        reconstructionTests: [],
        masterDna: null,
      };
      const archive = await createVyralAssetDnaOnlyPackage(
        baseManifest as unknown as Parameters<typeof createVyralAssetDnaOnlyPackage>[0],
        [retrieved.record],
        retrieved.payloadEntries,
        false,
      );
      const url = window.URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeDownloadName(retrieved.asset.name) + '-AI.vyral';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setPackageStatus(isRaster
        ? 'AI-ready file created for ' + retrieved.asset.name + '. Decoded image samples are preserved exactly; original encoded file bytes are not included.'
        : 'AI-ready file created for ' + retrieved.asset.name + '. The original file bytes are preserved exactly and verified.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this Asset DNA.');
      setPackageStatus('');
    } finally {
      setPackageBusy(false);
    }
  };

  const recoverAssetDna = async (asset: AssetRow) => {
    const userId = auth.user?.id;
    if (!supabase) {
      setError('Cloud storage is not configured here. DNA recovery did not start.');
      return;
    }
    if (!userId) {
      setError('Your sign-in session is unavailable. Sign in again, then retry Recover DNA.');
      return;
    }
    if (busy || packageBusy || verifyingAssetId) {
      setError('Another Asset operation is still running. Wait for it to finish, then retry Recover DNA.');
      return;
    }
    if (asset.processing_status !== 'uploading') {
      setError('This Asset is no longer marked as uploading. Refresh the workspace before retrying.');
      await loadWorkspace();
      return;
    }
    const version = versions.find((item) => item.asset_id === asset.id && item.storage_path === asset.storage_path) ?? [...versions].filter((item) => item.asset_id === asset.id).sort((a, b) => b.version_number - a.version_number)[0];
    if (!version) { setError('The original asset version is missing; recovery stopped without changing the asset.'); return; }
    setVerifyingAssetId(asset.id);
    setError('');
    setPackageStatus('Checking saved DNA and recovery state…');
    try {
      const { data: existingDna, error: existingDnaError } = await supabase
        .from('vyral_dna_records').select('id,payload').eq('asset_id', asset.id).limit(10);
      if (existingDnaError) throw existingDnaError;
      const existingSupportedDna = (existingDna ?? []).find((row) => {
        const payload = asRecord(row.payload);
        const source = asRecord(asRecord(payload.dna_record).source);
        return (payload.dna_schema_id === 'vyra.asset-dna' && payload.dna_schema_version === 3 &&
          source.asset_version_id === version.id) ||
          (payload.dna_schema_id === 'vyra.asset-file-dna' && payload.dna_schema_version === 1 &&
          (source.asset_version_id === version.id || payload.source_version_id === version.id));
      });
      if (existingSupportedDna) {
        const { data: finalizedAsset, error: finalizeError } = await supabase.from('vyral_assets')
          .update({ processing_status: 'ready' }).eq('id', asset.id).eq('user_id', userId).select('id').maybeSingle();
        if (finalizeError) throw finalizeError;
        if (!finalizedAsset) throw new Error('The saved DNA exists, but asset finalization is still blocked by permissions.');
        setPackageStatus('Previously saved DNA finalized for ' + asset.name + '.');
        await loadWorkspace();
        return;
      }
      if (existingDna?.length) throw new Error('An unsupported or version-mismatched DNA record already exists. Refresh and inspect it before retrying.');
      const isRasterImage = asset.asset_type === 'image' &&
        ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type.toLowerCase());
      if (isRasterImage) {
        // Always use the pinned server-side decoder. Browser canvas decoding can
        // vary by device/browser and must not silently create a different DNA.
        const { data: extraction, error: extractionError } = await supabase.functions.invoke('extract-vyral-asset-dna-v3', {
          body: { assetId: asset.id, versionId: version.id },
        });
        if (extractionError || extraction?.status !== 'extracted') {
          const response = (extractionError as unknown as { context?: Response } | null)?.context;
          let detail = extraction?.error ?? extractionError?.message ?? 'Server-side DNA extraction did not complete.';
          if (response && typeof response.clone === 'function') {
            try {
              const payload = await response.clone().json();
              if (typeof payload?.error === 'string') detail = payload.error;
            } catch { /* Keep the SDK error when the response is not JSON. */ }
          }
          throw new Error(detail);
        }
      } else {
        // Non-raster uploads use deterministic File DNA. Verify the stored
        // source bytes against both immutable Asset and Version fingerprints
        // before writing any recovery record or changing the Asset state.
        const { data: sourceBlob, error: sourceError } = await supabase.storage
          .from('vyral-assets').download(version.storage_path);
        if (sourceError || !sourceBlob) throw new Error('Could not read the original binary for recovery: ' + (sourceError?.message ?? 'source missing.'));
        const sourceBytes = new Uint8Array(await sourceBlob.arrayBuffer());
        if (sourceBytes.byteLength !== Number(version.size_bytes) ||
            sourceBytes.byteLength !== Number(asset.size_bytes)) {
          throw new Error('The stored source size does not match the immutable Asset and Version records. Recovery stopped without changing the source.');
        }
        const digestBuffer = new ArrayBuffer(sourceBytes.byteLength);
        new Uint8Array(digestBuffer).set(sourceBytes);
        const digest = await crypto.subtle.digest('SHA-256', digestBuffer);
        const actualSha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        if (!version.sha256 || actualSha256 !== version.sha256.toLowerCase() ||
            (asset.sha256 && actualSha256 !== asset.sha256.toLowerCase())) {
          throw new Error('The stored binary failed its immutable SHA-256 check. Recovery stopped without changing the source.');
        }
        const fileDna = await createVyralFileDnaV1({
          record_id: crypto.randomUUID(),
          source: { asset_id: asset.id, asset_version_id: version.id },
          bytes: sourceBytes,
          mime_type: version.mime_type || asset.mime_type || 'application/octet-stream',
          filename: asset.original_filename || asset.name,
          include_payload: false,
        });
        if (fileDna.record.file.sha256 !== actualSha256 ||
            fileDna.record.file.size_bytes !== sourceBytes.byteLength) {
          throw new Error('Universal File DNA did not match the verified original binary.');
        }
        const { error: dnaInsertError } = await supabase.from('vyral_dna_records').insert({
          id: fileDna.record.record_id,
          vyral_id: vyral.id,
          user_id: userId,
          asset_id: asset.id,
          scope: 'asset',
          schema_version: 1,
          dna_status: 'evolving',
          source_kind: 'system',
          verification_status: 'observed',
          payload: {
            dna_schema_id: 'vyra.asset-file-dna',
            dna_schema_version: 1,
            dna_record: fileDna.record,
            source_version_id: version.id,
            source_file_sha256: actualSha256,
            extraction_kind: 'deterministic_binary_file_identity',
          },
          reconstruction_data: {
            source_preservation: 'original_binary_retained',
            reconstruction_ready: false,
            recovery_level: 'identity-only',
            encoded_source_bytes_recoverable: false,
          },
        });
        if (dnaInsertError) throw dnaInsertError;
      }

      const { data: readyAsset, error: readyError } = await supabase.from('vyral_assets')
        .update({ processing_status: 'ready' }).eq('id', asset.id).eq('user_id', userId).select('id').maybeSingle();
      if (readyError) throw readyError;
      if (!readyAsset) throw new Error('DNA was saved, but the Asset ready state could not be updated. Retry Recover DNA to finalize safely.');
      setPackageStatus((isRasterImage ? 'Pinned server-side DNA v3' : 'Deterministic File DNA v1') +
        ' recovered and saved for ' + asset.name + '.');
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'DNA recovery failed. The original asset was preserved.');
      setPackageStatus('');
    } finally {
      setVerifyingAssetId(null);
    }
  };
  const extractAssetDnaV3 = async (asset: AssetRow) => {
    const userId = auth.user?.id;
    if (!supabase || !userId || busy || packageBusy || verifyingAssetId || extractingDnaV3 || asset.processing_status !== 'ready') return;
    if (asset.asset_type !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type.toLowerCase())) {
      setError('DNA v3 extraction currently supports PNG, JPEG and WebP raster images only.');
      return;
    }
    const version = versions.find((item) => item.asset_id === asset.id && item.storage_path === asset.storage_path)
      ?? [...versions].filter((item) => item.asset_id === asset.id).sort((a, b) => b.version_number - a.version_number)[0];
    if (!version) { setError('The current source Version is missing. No DNA was created.'); return; }
    if (version.storage_path !== asset.storage_path || version.sha256 !== asset.sha256 ||
        Number(version.size_bytes) !== Number(asset.size_bytes) ||
        version.mime_type.toLowerCase() !== asset.mime_type.toLowerCase()) {
      setError('Asset and source Version metadata do not match. Refresh and verify the original before extraction.');
      return;
    }
    if (!window.confirm('Create immutable DNA v3 from the current source file "' + asset.name + '"? The server will verify its SHA-256 and extract lossless decoded RGBA samples. The original Asset and Version will not be changed. This does not preserve the original PNG/JPEG file bytes.')) return;

    setVerifyingAssetId(asset.id);
    setExtractingDnaV3(true);
    setError('');
    setPackageStatus('Verifying source bytes and extracting DNA v3 for ' + asset.name + '…');
    try {
      const { data: existing, error: existingError } = await supabase.from('vyral_dna_records')
        .select('id,schema_version').eq('asset_id', asset.id).eq('schema_version', 3).limit(1);
      if (existingError) throw existingError;
      if (existing?.length) throw new Error('A DNA v3 record already exists for this Asset. Existing DNA records are immutable.');
      const { data, error: invokeError } = await supabase.functions.invoke('extract-vyral-asset-dna-v3', {
        body: { assetId: asset.id, versionId: version.id },
      });
      if (invokeError || data?.status !== 'extracted') {
        const response = (invokeError as unknown as { context?: Response } | null)?.context;
        let detail = data?.error ?? invokeError?.message ?? 'DNA v3 extraction did not complete.';
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json();
            if (typeof payload?.error === 'string') detail = payload.error;
            if (typeof payload?.detail === 'string') detail += ' ' + payload.detail;
          } catch { /* Keep the SDK error. */ }
        }
        throw new Error(detail);
      }
      setPackageStatus('DNA v3 extracted and saved for ' + asset.name + ' · ' + data.width + '×' + data.height +
        ' · ' + data.tileCount + ' lossless tiles · decoded-sample SHA-256 ' + String(data.decodedSamplesSha256).slice(0, 16) + '…');
      await loadWorkspace();
    } catch (cause) {
      setPackageStatus('');
      setError(cause instanceof Error ? cause.message : 'DNA v3 extraction failed. The original Asset was preserved.');
    } finally {
      setVerifyingAssetId(null);
      setExtractingDnaV3(false);
    }
  };

  const verifyAssetIntegrity = async (asset: AssetRow) => {
    if (!supabase || verifyingAssetId || busy || packageBusy) return;
    const assetVersions = versions.filter((version) => version.asset_id === asset.id);
    const currentVersion = assetVersions.find((version) => version.storage_path === asset.storage_path)
      ?? [...assetVersions].sort((left, right) => right.version_number - left.version_number)[0];
    if (!currentVersion) { setError('No stored asset version is available to verify.'); return; }

    setVerifyingAssetId(asset.id);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('verify-vyral-asset', {
        body: { assetId: asset.id, versionId: currentVersion.id },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json();
            if (typeof payload?.error === 'string') detail = payload.error;
            if (payload?.status === 'mismatch') detail = 'Integrity mismatch: stored media differs from its recorded SHA-256 or file size.';
          } catch { /* Keep the SDK error message when the response is not JSON. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'verified') throw new Error('The verification service did not return a verified result.');
      setPackageStatus(data.sourceFileReconstruction === 'byte_exact'
        ? 'VYRA verified that the original file can be rebuilt exactly for ' + asset.name + '.'
        : 'VYRA verified the original file integrity for ' + asset.name + '.');
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Server-side asset verification failed.');
    } finally {
      setVerifyingAssetId(null);
    }
  };

  const compareOriginReconstruction = async (asset: AssetRow) => {
    if (!supabase || comparingReconstructionAssetId || verifyingAssetId || busy || packageBusy) return;
    const config = asset.id === 'a40f067c-0ed1-4b93-814f-4f2f925ff320'
      ? { versionId: 'b23dafc8-f5b8-447b-b06b-77553c590a08', dnaId: '8856e567-0221-4011-b9c2-22c228faa449' }
      : asset.id === 'a63edc73-0247-4477-84b9-f942080de694'
        ? { versionId: '273ecd4f-4045-490d-8616-993995a3bec4', dnaId: '95b1ca66-01f5-4ecd-a679-bd891c8549ad' }
        : asset.id === '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23'
          ? { versionId: '07e940be-b5c2-4163-b45b-34ad9c66e318', dnaId: '5460940d-4343-44bc-a109-a0141e5a17d4' }
          : null;
    const candidateVersion = config && versions.find((version) => version.asset_id === asset.id && version.id === config.versionId && version.storage_path === asset.storage_path);
    if (!config || !candidateVersion) { setError('The registered blind reconstruction candidate version is not available.'); return; }
    setComparingReconstructionAssetId(asset.id); setError('');
    setPackageStatus('Downloading both private images and comparing decoded pixels…');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('compare-origin-01-reconstruction', {
        body: { originalAssetId: '2c496cd5-84c4-44b1-b02a-fca4265cc592', originalVersionId: 'b4376fd9-a577-464e-91b4-e33791559e7f', candidateAssetId: asset.id, candidateVersionId: candidateVersion.id, dnaRecordId: config.dnaId },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try { const payload = await response.clone().json(); if (typeof payload?.error === 'string') detail = payload.error; if (payload?.status === 'inconclusive') detail = 'Comparison is inconclusive because stored file integrity did not match its recorded evidence.'; } catch { /* Keep SDK error. */ }
        }
        throw new Error(detail);
      }
      if (!['passed', 'failed', 'inconclusive'].includes(data?.status)) throw new Error('The reconstruction verifier did not return a recognized test result.');
      const score = typeof data.similarityScore === 'number' ? ' · RGB similarity ' + (data.similarityScore * 100).toFixed(2) + '%' : '';
      setPackageStatus((data.status === 'passed' ? 'Exact decoded-pixel match confirmed' : data.status === 'failed' ? 'Reconstruction differs from the original' : 'Reconstruction comparison inconclusive') + score);
      await loadWorkspace();
    } catch (cause) { setPackageStatus(''); setError(cause instanceof Error ? cause.message : 'Independent reconstruction comparison failed.'); }
    finally { setComparingReconstructionAssetId(null); }
  };

  const extractOriginDnaV3 = async () => {
    if (!supabase || extractingDnaV3 || busy || packageBusy || !isProtectedVyral(vyral)) return;
    const hasExistingV3 = dnaRecords.some((record) =>
      record.asset_id === '2c496cd5-84c4-44b1-b02a-fca4265cc592' &&
      record.payload?.dna_schema_id === 'vyra.asset-dna' &&
      record.payload?.dna_schema_version === 3
    );
    if (hasExistingV3) {
      setError('An ORIGIN-01 DNA v3 record already exists. DNA records are immutable and will not be overwritten.');
      return;
    }
    const confirmed = window.confirm(
      'Extract DNA v3 directly from the protected ORIGIN-01 original in private Development Storage?\n\nThe server will verify the original SHA-256, decode the source, and add new DNA tile files plus one DNA record. The original asset and version will not be changed.'
    );
    if (!confirmed) return;

    setExtractingDnaV3(true);
    setError('');
    setPackageStatus('Verifying protected original and extracting lossless DNA v3 tiles…');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('extract-origin-01-dna-v3', {
        body: {
          vyralId: 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
          assetId: '2c496cd5-84c4-44b1-b02a-fca4265cc592',
          versionId: 'b4376fd9-a577-464e-91b4-e33791559e7f',
        },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json();
            if (typeof payload?.error === 'string') detail = payload.error;
            if (typeof payload?.detail === 'string') detail += ' ' + payload.detail;
          } catch { /* Keep the SDK error message when the response is not JSON. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'extracted' || data?.extractionStatus !== 'extracted_not_yet_reconstructed') {
        throw new Error('The DNA v3 extraction service did not confirm a complete extraction.');
      }
      setPackageStatus(
        'DNA v3 extracted from protected original · ' + data.width + '×' + data.height +
        ' · ' + data.channelLayout + ' · ' + data.tileCount + ' tiles · sample SHA-256 ' +
        String(data.decodedSamplesSha256).slice(0, 16) + '… · reconstruction still pending'
      );
      await loadWorkspace();
    } catch (cause) {
      setPackageStatus('');
      setError(cause instanceof Error ? cause.message : 'ORIGIN-01 DNA v3 extraction failed.');
    } finally {
      setExtractingDnaV3(false);
    }
  };

  const verifyOriginDnaV3 = async () => {
    if (!supabase || verifyingDnaV3 || extractingDnaV3 || busy || packageBusy || !isProtectedVyral(vyral)) return;
    const hasExistingV3 = dnaRecords.some((record) => record.asset_id === '2c496cd5-84c4-44b1-b02a-fca4265cc592' && record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3);
    if (!hasExistingV3) { setError('ORIGIN-01 DNA v3 record is not available yet. Extract DNA v3 first.'); return; }
    if (!window.confirm('Re-read all 100 DNA tiles, verify every tile SHA-256, re-download the protected original, decode it again, and compare reconstructed samples? The original will not be modified.')) return;
    setVerifyingDnaV3(true); setError(''); setPackageStatus('Re-reading DNA tiles and checking reconstructed samples…');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('verify-origin-01-dna-v3', { body: { dnaRecordId: '761b39c8-be23-4ca7-88c9-16151a0a0c41' } });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') { try { const payload = await response.clone().json(); if (typeof payload?.error === 'string') detail = payload.error; if (typeof payload?.detail === 'string') detail += ' ' + payload.detail; } catch { /* Keep SDK error. */ } }
        throw new Error(detail);
      }
      if (data?.status !== 'passed' || data?.verifiedTiles !== 100 || data?.originalBytesUnchanged !== true) throw new Error('The verifier did not confirm all 100 tiles and exact decoded-sample reconstruction.');
      setPackageStatus('Decoded-sample reconstruction verified · ' + data.verifiedTiles + ' tiles · ' + data.dimensions.width + '×' + data.dimensions.height + ' ' + data.channelLayout + ' · SHA-256 ' + String(data.reconstructedSha256).slice(0, 16) + '…');
      await loadWorkspace();
    } catch (cause) { setPackageStatus(''); setError(cause instanceof Error ? cause.message : 'ORIGIN-01 DNA v3 verification failed.'); }
    finally { setVerifyingDnaV3(false); }
  };
  const deleteAsset = async (asset: AssetRow) => {
    if (isProtectedVyral(vyral)) {
      setError('This Vyral is protected. Its original assets and stored versions cannot be deleted.');
      return;
    }
    if (!supabase || !window.confirm('Delete "' + asset.name + '" and its stored versions, DNA records and fingerprints?')) return;
    setBusy(true); setError('');
    const paths = versions.filter((version) => version.asset_id === asset.id).map((version) => version.storage_path);
    if (!paths.includes(asset.storage_path)) paths.push(asset.storage_path);
    const { error: storageError } = await supabase.storage.from('vyral-assets').remove(paths);
    if (storageError) { setError(storageError.message); setBusy(false); return; }
    const { error: deleteError } = await supabase.from('vyral_assets').delete().eq('id', asset.id);
    await loadWorkspace();
    if (deleteError) setError('Stored media was removed, but the asset record could not be deleted: ' + deleteError.message);
    setBusy(false);
  };

  const openAssetDetails = (asset: AssetRow) => {
    const aiDetails = asset.metadata?.ai_details as VyralAiDetails | undefined;
    const fields = aiDetails?.fields ?? {};
    setDetailsAsset(asset);
    setDetailsDraft({
      name: asset.name ?? '',
      description: asset.description ?? '',
      category: typeof fields.category?.value === 'string' ? fields.category.value : '',
      style: typeof fields.style?.value === 'string' ? fields.style.value : '',
      tags: Array.isArray(fields.tags?.value) ? fields.tags.value.join(', ') : '',
    });
    setDetailsExtraDraft(Object.fromEntries(Object.entries(fields)
      .filter(([key]) => !['name', 'description', 'category', 'style', 'tags'].includes(key))
      .map(([key, field]) => [key, formatAiFieldDraft(field.value)])));
  };

  const openCollectionDetails = () => {
    const details = vyral.metadata?.ai_details as VyralAiDetails | undefined;
    const fields = details?.fields ?? {};
    const draft = {
      name: vyral.name,
      description: vyral.description ?? '',
      category: typeof fields.category?.value === 'string' ? fields.category.value : '',
      style: typeof fields.style?.value === 'string' ? fields.style.value : '',
      tags: Array.isArray(fields.tags?.value) ? fields.tags.value.join(', ') : '',
    };
    const extraEntries = Object.entries(fields).filter(([key]) => !['name', 'description', 'category', 'style', 'tags'].includes(key));
    setCollectionDraft(draft);
    setCollectionDetailsBaseline(draft);
    setCollectionExtraDraft(Object.fromEntries(extraEntries.map(([key, field]) => [key, formatAiFieldDraft(field.value)])));
    setCollectionExtraBaseline(Object.fromEntries(extraEntries.map(([key, field]) => [key, formatAiFieldDraft(field.value)])));
    setCollectionExtraBaselineValues(Object.fromEntries(extraEntries.map(([key, field]) => [key, field.value])));
    setCollectionDetailsOpen(true);
  };

  const saveCollectionDetails = async () => {
    if (!supabase || busy || !collectionDraft.name.trim() || !collectionDetailsBaseline) return;
    setBusy(true); setError('');
    try {
      // Merge only fields the creator actually changed, against the latest persisted record.
      const { data: latestVyral, error: latestReadError } = await supabase.from('vyrals')
        .select('metadata').eq('id', vyral.id).maybeSingle();
      if (latestReadError || !latestVyral) throw latestReadError ?? new Error('Vyral was not found.');
      const currentMetadata = latestVyral.metadata && typeof latestVyral.metadata === 'object' && !Array.isArray(latestVyral.metadata)
        ? latestVyral.metadata as Record<string, unknown> : {};
      const currentDetails = currentMetadata.ai_details as VyralAiDetails | undefined;
      const generatedAt = new Date().toISOString();
      const nameChanged = collectionDraft.name.trim() !== collectionDetailsBaseline.name.trim();
      const descriptionChanged = collectionDraft.description.trim() !== collectionDetailsBaseline.description.trim();
      const categoryChanged = collectionDraft.category !== collectionDetailsBaseline.category;
      const styleChanged = collectionDraft.style !== collectionDetailsBaseline.style;
      const tagsChanged = collectionDraft.tags !== collectionDetailsBaseline.tags;
      const changedExtras = Object.entries(collectionExtraDraft).filter(([key, value]) => value !== (collectionExtraBaseline[key] ?? ''));
      const hasDetailChanges = nameChanged || descriptionChanged || categoryChanged || styleChanged || tagsChanged || changedExtras.length > 0;
      if (!hasDetailChanges) { setCollectionDetailsOpen(false); return; }

      const inventorySignature = assets
        .map((asset) => [
          asset.id, asset.name, asset.asset_type, asset.mime_type, asset.updated_at, asset.sha256 ?? '',
          asset.description ?? '', JSON.stringify(asset.metadata?.ai_details ?? {}),
        ].join(':'))
        .sort()
        .join('|');
      let sourceRevision = 2166136261;
      for (let index = 0; index < inventorySignature.length; index += 1) {
        sourceRevision ^= inventorySignature.charCodeAt(index);
        sourceRevision = Math.imul(sourceRevision, 16777619);
      }
      sourceRevision >>>= 0;
      const baseDetails: VyralAiDetails = currentDetails ?? {
        schema_version: 1, scope: 'vyral', source_version_id: null, source_revision: sourceRevision,
        provider: 'creator', model: 'manual', generated_at: generatedAt, stale: false, fields: {},
      };
      let updatedDetails = baseDetails;
      if (nameChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'name', collectionDraft.name.trim(), 'creator_edited', generatedAt);
      if (descriptionChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'description', collectionDraft.description.trim(), 'creator_edited', generatedAt);
      if (categoryChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'category', collectionDraft.category.trim(), 'creator_edited', generatedAt);
      if (styleChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'style', collectionDraft.style.trim(), 'creator_edited', generatedAt);
      if (tagsChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'tags', collectionDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 30), 'creator_edited', generatedAt);
      for (const [key, value] of changedExtras) {
        const previous = collectionExtraBaselineValues[key] ?? currentDetails?.fields?.[key]?.value ?? null;
        updatedDetails = setVyralAiDetailField(updatedDetails, key, parseAiFieldDraft(value, previous), 'creator_edited', generatedAt);
      }
      updatedDetails = { ...updatedDetails, source_revision: sourceRevision, stale: false };
      const nextMetadata = {
        ...currentMetadata, ai_details: updatedDetails, ai_details_status: 'ready',
        ai_details_source_revision: sourceRevision, ai_details_inventory_signature: String(sourceRevision),
        ...(nameChanged ? { identity_name_origin: 'creator_edited' } : {}),
        ...(descriptionChanged ? { identity_description_origin: 'creator_edited' } : {}),
      };
      const { error: updateError } = await supabase.from('vyrals').update({
        ...(nameChanged ? { name: collectionDraft.name.trim().slice(0, 100) } : {}),
        ...(descriptionChanged ? { description: collectionDraft.description.trim().slice(0, 1000) } : {}),
        metadata: nextMetadata,
      }).eq('id', vyral.id);
      if (updateError) throw updateError;
      onVyralUpdated({
        ...(nameChanged ? { name: collectionDraft.name.trim() } : {}),
        ...(descriptionChanged ? { description: collectionDraft.description.trim() } : {}),
        metadata: nextMetadata,
      });
      setCollectionDetailsOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Vyral details.');
    } finally { setBusy(false); }
  };

  const saveAssetDetails = async () => {
    if (!supabase || !detailsAsset || busy) return;
    if (!detailsDraft.name.trim()) { setError('Asset name cannot be empty.'); return; }
    setBusy(true); setError('');
    try {
      // Read after the dialog opened so an in-flight AI refresh cannot be overwritten
      // by a stale metadata snapshot when the creator saves their edits.
      const { data: latestAsset, error: latestReadError } = await supabase.from('vyral_assets')
        .select('metadata').eq('id', detailsAsset.id).eq('vyral_id', vyral.id).maybeSingle();
      if (latestReadError || !latestAsset) throw latestReadError ?? new Error('Asset was not found.');
      const currentMetadata = latestAsset.metadata && typeof latestAsset.metadata === 'object' && !Array.isArray(latestAsset.metadata)
        ? latestAsset.metadata as Record<string, unknown> : {};
      const currentDetails = currentMetadata.ai_details as VyralAiDetails | undefined;
      const baselineDetails = detailsAsset.metadata?.ai_details as VyralAiDetails | undefined;
      const baselineFields = baselineDetails?.fields ?? {};
      const generatedAt = new Date().toISOString();
      const baselineCategory = typeof baselineFields.category?.value === 'string' ? baselineFields.category.value : '';
      const baselineStyle = typeof baselineFields.style?.value === 'string' ? baselineFields.style.value : '';
      const baselineTags = Array.isArray(baselineFields.tags?.value) ? baselineFields.tags.value.join(', ') : '';
      const nameChanged = detailsDraft.name.trim() !== (detailsAsset.name ?? '').trim();
      const descriptionChanged = detailsDraft.description.trim() !== (detailsAsset.description ?? '').trim();
      const categoryChanged = detailsDraft.category !== baselineCategory;
      const styleChanged = detailsDraft.style !== baselineStyle;
      const tagsChanged = detailsDraft.tags !== baselineTags;
      const changedExtras = Object.entries(detailsExtraDraft).filter(([key, value]) =>
        value !== formatAiFieldDraft(baselineFields[key]?.value ?? null));
      const hasDetailChanges = nameChanged || descriptionChanged || categoryChanged || styleChanged || tagsChanged || changedExtras.length > 0;
      if (!hasDetailChanges) { setDetailsAsset(null); return; }
      const baseDetails: VyralAiDetails = currentDetails ?? {
        schema_version: 1, scope: 'asset', source_version_id: versions.find((item) => item.asset_id === detailsAsset.id)?.id ?? null,
        source_revision: null, provider: 'creator', model: 'manual', generated_at: generatedAt, stale: false, fields: {},
      };
      let updatedDetails = baseDetails;
      if (nameChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'name', detailsDraft.name.trim(), 'creator_edited', generatedAt);
      if (descriptionChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'description', detailsDraft.description.trim(), 'creator_edited', generatedAt);
      if (categoryChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'category', detailsDraft.category.trim(), 'creator_edited', generatedAt);
      if (styleChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'style', detailsDraft.style.trim(), 'creator_edited', generatedAt);
      if (tagsChanged) updatedDetails = setVyralAiDetailField(updatedDetails, 'tags', detailsDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 30), 'creator_edited', generatedAt);
      for (const [key, value] of changedExtras) {
        const previous = baselineFields[key]?.value ?? currentDetails?.fields?.[key]?.value ?? null;
        updatedDetails = setVyralAiDetailField(updatedDetails, key, parseAiFieldDraft(value, previous), 'creator_edited', generatedAt);
      }
      const { error: updateError } = await supabase.from('vyral_assets').update({
        ...(nameChanged ? { name: detailsDraft.name.trim().slice(0, 100) } : {}),
        ...(descriptionChanged ? { description: detailsDraft.description.trim().slice(0, 1000) } : {}),
        metadata: {
          ...currentMetadata, ai_details: updatedDetails, ai_details_status: 'ready',
          ...(nameChanged ? { identity_name_origin: 'creator_edited' } : {}),
          ...(descriptionChanged ? { identity_description_origin: 'creator_edited' } : {}),
        },
      }).eq('id', detailsAsset.id).eq('vyral_id', vyral.id);
      if (updateError) throw updateError;
      setDetailsAsset(null);
      await loadWorkspace();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Asset details.');
    } finally { setBusy(false); }
  };

  const openPreview = async (asset: AssetRow) => {
    if (!supabase) return;
    setPreviewAsset(asset); setPreviewUrl('');
    const { data, error: urlError } = await supabase.storage.from('vyral-assets').createSignedUrl(asset.storage_path, 300);
    if (urlError) setError(urlError.message);
    else setPreviewUrl(data.signedUrl);
  };

  const saveVisionObservation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || savingVision) return;
    const asset = assets.find((item) => item.id === visionAssetId);
    const version = versions.find((item) => item.id === visionVersionId && item.asset_id === visionAssetId);
    if (!asset || !version) { setError('Select an asset and one of its source versions.'); return; }
    let observation: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(visionJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Observation must be a JSON object.');
      observation = parsed as Record<string, unknown>;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Observation JSON is invalid.');
      return;
    }
    setSavingVision(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('record-vyral-vision-observation', {
        body: {
          assetId: asset.id,
          versionId: version.id,
          taskKind: visionTaskKind,
          modelProvider: visionProvider.trim(),
          modelId: visionModel.trim(),
          confidence: visionConfidence.trim() ? Number(visionConfidence) : null,
          observation,
        },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json() as { error?: string };
            if (payload.error) detail = payload.error;
          } catch { /* Keep the SDK error message. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'recorded') throw new Error('Vision observation was not confirmed as recorded.');
      setVisionJson('{"summary":"","attributes":[],"uncertainties":[]}');
      setVisionConfidence('');
      await loadWorkspace();
      setPackageStatus('Vision observation recorded with source-version integrity evidence. Model identity remains self-reported.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record Vision observation.');
    } finally {
      setSavingVision(false);
    }
  };

  const reviewVisionObservation = async (observationId: string, decision: 'creator_confirmed' | 'disputed') => {
    if (!supabase || reviewingObservationId) return;
    setReviewingObservationId(observationId);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('record-vyral-vision-review', {
        body: { observationId, decision },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try {
            const payload = await response.clone().json() as { error?: string };
            if (payload.error) detail = payload.error;
          } catch { /* Keep the SDK error message. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'review_recorded') throw new Error('Creator review was not confirmed as recorded.');
      await loadWorkspace();
      setPackageStatus(decision === 'creator_confirmed'
        ? 'Creator confirmation recorded for this observation only. The complete Asset DNA remains evolving.'
        : 'Dispute recorded for this observation. The original AI observation remains preserved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record creator review.');
    } finally {
      setReviewingObservationId(null);
    }
  };


  const promoteVisionKnowledge = async (observationId: string) => {
    if (!supabase || promotingObservationId) return;
    const observation = observations.find((item) => item.id === observationId);
    if (!observation) return;
    const fields = flattenObservation(observation.observation);
    const fieldPath = window.prompt('Enter the exact JSON field path to promote (example: identity.eye_color).\\n\\nAvailable fields:\\n' + Object.keys(fields).join('\\n'));
    if (!fieldPath?.trim() || !(fieldPath.trim() in fields)) return;
    let acceptedValue: unknown;
    try { acceptedValue = JSON.parse(fields[fieldPath.trim()]); }
    catch { setError('Selected field could not be parsed as JSON.'); return; }
    const note = window.prompt('Optional creator note for this field (leave blank if none).') ?? '';
    setPromotingObservationId(observationId);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('promote-vyral-vision-field', {
        body: { observationId, fieldPath: fieldPath.trim(), acceptedValue, note },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try { const payload = await response.clone().json() as { error?: string }; if (payload.error) detail = payload.error; } catch { /* Keep SDK error. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'field_promoted') throw new Error('Field-level Knowledge promotion was not confirmed.');
      await loadWorkspace();
      setPackageStatus('One creator-confirmed Vision field was added to DNA as an immutable record. The full asset remains evolving.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not promote this Vision field.');
    } finally {
      setPromotingObservationId(null);
    }
  };
  const resolveVisionKnowledgeConflict = async (
    group: { assetId: string; versionId: string; taskKind: string; fieldPath: string; records: DnaRow[] },
    resolutionType: 'prefer_one' | 'keep_contextual',
  ) => {
    if (!supabase || resolvingConflictKey) return;
    let preferredRecordId: string | undefined;
    let note = '';
    let contextLabel = '';
    let contextTags: string[] = [];
    if (resolutionType === 'prefer_one') {
      const choices = group.records.map((record, index) => {
        const model = String(record.payload.model_provider_claim ?? 'Unknown model') + ' · ' + String(record.payload.model_id_claim ?? 'Unknown ID');
        return (index + 1) + '. ' + model + '\n' + JSON.stringify(record.payload.accepted_value);
      }).join('\n\n');
      const answer = window.prompt('Choose the value to prefer for this exact conflict scope. This will not delete or overwrite other evidence.\n\n' + choices + '\n\nEnter the number to prefer:');
      if (answer === null) return;
      const selectedIndex = Number(answer) - 1;
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= group.records.length) {
        setError('Please enter a valid number from the conflict list.');
        return;
      }
      preferredRecordId = group.records[selectedIndex].id;
      note = window.prompt('Optional reason for this preference (max 2,000 characters).') ?? '';
    } else {
      const label = window.prompt('Name the creator-defined contexts where these values apply (for example: front view; side view). Do not guess contexts. (Required, max 300 characters)');
      if (label === null || !label.trim() || label.trim().length > 300) {
        setError('Enter a context label of 1–300 characters.');
        return;
      }
      contextLabel = label.trim();
      const tagsAnswer = window.prompt('Enter exact context tags separated by semicolons (1–12 tags, each 1–64 characters). Example: front view; daylight; close-up. These are creator-defined tags, not AI-inferred.');
      if (tagsAnswer === null) return;
      contextTags = tagsAnswer.split(';').map((tag) => tag.trim().normalize('NFC').toLowerCase()).filter(Boolean);
      if (contextTags.length < 1 || contextTags.length > 12 || contextTags.some((tag) => tag.length > 64 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(tag)) || new Set(contextTags).size !== contextTags.length) {
        setError('Enter 1–12 unique context tags using letters, numbers, spaces, underscores or hyphens; each tag must be 1–64 characters.');
        return;
      }
      const answer = window.prompt('Explain why these values should remain valid in those contexts. (Required, max 2,000 characters)');
      if (answer === null || answer.trim().length < 3 || answer.trim().length > 2000) return;
      note = answer.trim();
    }
    const groupKey = JSON.stringify([group.assetId, group.versionId, group.taskKind, group.fieldPath]);
    setResolvingConflictKey(groupKey);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('resolve-vyral-vision-conflict', {
        body: {
          resolutionRequestId: crypto.randomUUID(),
          resolutionType,
          recordIds: group.records.map((record) => record.id),
          preferredRecordId,
          contextLabel,
          contextTags,
          note,
        },
      });
      if (invokeError) {
        let detail = invokeError.message;
        const response = (invokeError as unknown as { context?: Response }).context;
        if (response && typeof response.clone === 'function') {
          try { const payload = await response.clone().json() as { error?: string }; if (payload.error) detail = payload.error; } catch { /* Keep SDK error. */ }
        }
        throw new Error(detail);
      }
      if (data?.status !== 'conflict_resolved' && data?.status !== 'already_recorded') throw new Error('Conflict resolution was not confirmed by the server.');
      await loadWorkspace();
      setPackageStatus(resolutionType === 'prefer_one'
        ? 'Creator preference recorded. All original promoted values remain unchanged.'
        : 'Context-dependent resolution recorded. All competing values remain unchanged.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the conflict resolution.');
    } finally {
      setResolvingConflictKey(null);
    }
  };

  const saveDnaNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !dnaNote.trim()) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const selectedAsset = dnaAssetId && dnaAssetId !== 'vyral' ? dnaAssetId : null;
    const { error: insertError } = await supabase.from('vyral_dna_records').insert({
      vyral_id: vyral.id, user_id: auth.user.id, asset_id: selectedAsset,
      scope: selectedAsset ? 'asset' : 'vyral', schema_version: 1, dna_status: 'evolving',
      source_kind: 'creator', verification_status: 'creator_confirmed',
      payload: { creator_statement: dnaNote.trim(), authority: 'creator_defined', recorded_at: new Date().toISOString() },
      reconstruction_data: {},
    });
    if (insertError) setError(insertError.message);
    else { setDnaNote(''); await loadWorkspace(); }
  };

  const updateMasterAssetDraft = (assetId: string, patch: Partial<MasterAssetDraft>) => {
    setMasterAssetDrafts((current) => ({
      ...current,
      [assetId]: {
        role: current[assetId]?.role ?? '',
        purpose: current[assetId]?.purpose ?? '',
        targetAssetId: current[assetId]?.targetAssetId ?? '__vyral__',
        rationale: current[assetId]?.rationale ?? '',
        ...patch,
      },
    }));
  };

  const saveMasterDnaPurpose = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !masterDnaAvailable) return;
    const intendedUses = masterDnaUsesDraft.split(',').map((item) => item.trim()).filter(Boolean);
    if (!masterDnaPurposeDraft.trim() || !intendedUses.length) {
      setError('Add a Vyral purpose and at least one intended use.');
      return;
    }
    setMasterDnaSaving(true); setError(''); setMasterDnaMessage('');
    const { error: saveError } = await supabase.from('vyrals').update({
      master_dna_purpose: masterDnaPurposeDraft.trim(),
      master_dna_intended_uses: intendedUses,
    }).eq('id', vyral.id);
    if (saveError) {
      setError(saveError.message);
    } else {
      setMasterDnaMessage('Vyral purpose saved. The previous Master DNA snapshot, if any, is now stale.');
      await loadWorkspace();
    }
    setMasterDnaSaving(false);
  };

  const saveMasterAssetClassification = async (asset: AssetRow) => {
    if (!supabase || !masterDnaAvailable) return;
    const draft = masterAssetDrafts[asset.id];
    if (!draft || !draft.role || !draft.purpose.trim() || !draft.rationale.trim()) {
      setError('Choose an Asset role and enter its purpose and relationship rationale.');
      return;
    }
    setMasterDnaSaving(true); setError(''); setMasterDnaMessage('');
    const { error: saveError } = await supabase.rpc('set_vyral_master_dna_asset_classification', {
      p_asset_id: asset.id,
      p_role: draft.role,
      p_purpose: draft.purpose.trim(),
      p_target_asset_id: draft.targetAssetId === '__vyral__' ? null : draft.targetAssetId,
      p_rationale: draft.rationale.trim(),
    });
    if (saveError) setError(saveError.message);
    else {
      setMasterDnaMessage('Asset role, purpose and relationship saved.');
      await loadWorkspace();
    }
    setMasterDnaSaving(false);
  };

  const buildMasterDna = async () => {
    if (!supabase || !masterDnaAvailable) return;
    setMasterDnaBuilding(true); setError(''); setMasterDnaMessage(''); setMasterDnaBlockers([]);
    const { data, error: buildError } = await supabase.functions.invoke('build-vyral-master-dna', {
      body: { vyralId: vyral.id },
    });
    if (buildError || data?.error) {
      setError(data?.error ?? buildError?.message ?? 'Master DNA could not be created.');
      setMasterDnaBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
    } else {
      setMasterDnaBlockers([]);
      setMasterDnaStatus('ready');
      setMasterDnaRevision(Number(data?.revision ?? masterDnaRevision));
      setMasterDnaMessage(data?.unchanged
        ? 'Master DNA is already current. No new revision was needed.'
        : 'Master DNA revision ' + data.revision + ' created and verified.');
      onVyralUpdated({ master_dna_status: 'ready', master_dna_revision: Number(data?.revision ?? masterDnaRevision) });
      await loadWorkspace();
    }
    setMasterDnaBuilding(false);
  };

  const saveLicense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError('');
    const { error: updateError } = await supabase.from('vyrals').update({ license_policy: licenseDraft }).eq('id', vyral.id);
    if (updateError) {
      setError(updateError.message);
    } else {
      onVyralUpdated({ license_policy: licenseDraft });
      // Refresh the derived collection snapshot when its public AI-resolution policy changes.
      try {
        await supabase.functions.invoke('build-vyral-master-dna', { body: { vyralId: vyral.id } });
      } catch {
        // Saving the creator's policy remains successful; a later Asset update can retry the snapshot refresh.
      }
      await loadWorkspace();
    }
    setBusy(false);
  };

  const checkCollectionReference = async (reference: CollectionReferenceRow) => {
    if (!reference.resolver_uri || packageBusy) return;
    setReferenceChecks((current) => ({ ...current, [reference.id]: { status: 'checking' } }));
    try {
      const result = await checkPublicVyralCollectionReferenceV1({
        resolver_uri: reference.resolver_uri,
        source_vyral_id: reference.source_vyral_id,
        source_revision: reference.source_revision,
        projection_sha256: reference.projection_sha256,
        compact_snapshot: reference.compact_snapshot,
      });
      setReferenceChecks((current) => ({ ...current, [reference.id]: result }));
    } catch (cause) {
      setReferenceChecks((current) => ({
        ...current,
        [reference.id]: { status: 'error', message: cause instanceof Error ? cause.message : 'Could not check this collection right now.' },
      }));
    }
  };

  const deleteCollectionReference = async (reference: CollectionReferenceRow) => {
    if (!supabase || !window.confirm('Remove this collection reference from this Vyral? The source collection will not be changed.')) return;
    setPackageBusy(true);
    const { error: deleteError } = await supabase.from('vyral_collection_references')
      .delete().eq('id', reference.id).eq('destination_vyral_id', vyral.id);
    if (deleteError) setError(deleteError.message);
    else await loadWorkspace();
    setPackageBusy(false);
  };

  const deleteFolder = async (folder: FolderRow) => {
    if (!supabase || !window.confirm('Delete folder "' + folder.name + '"? Files inside will move to the Vyral root.')) return;
    setBusy(true);
    const { error: deleteError } = await supabase.from('vyral_folders').delete().eq('id', folder.id);
    if (deleteError) { setError(deleteError.message); setBusy(false); return; }
    if (activeFolderId === folder.id) setActiveFolderId(folder.parent_id);
    await loadWorkspace(); setBusy(false);
  };

  const renderAssetCard = (asset: AssetRow) => {
    const Icon = typeIcon(asset.asset_type);
    const protectedAsset = isProtectedVyral(vyral);
    const isPackage = asset.original_filename.toLowerCase().endsWith('.vyral') || asset.name.toLowerCase().endsWith('.vyral');
    const selected = selectedAssetIds.includes(asset.id);
    const visibility = asset.metadata?.visibility === 'public' ? 'public' : 'private';
    return (
      <article key={asset.id} className={surface + ' min-w-0 overflow-hidden ' + (selected ? 'ring-2 ring-[var(--vyra-accent-primary)]' : '')}>
        <button type="button" onClick={() => void openPreview(asset)} className="flex aspect-[4/3] w-full items-center justify-center border-b border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]" aria-label={'Open ' + asset.name}>
          <Icon size={36} strokeWidth={1.5} />
        </button>
        <div className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-2"><label className="inline-flex items-center gap-2 text-[11px] font-medium text-[var(--vyra-text-secondary)]"><input type="checkbox" checked={selected} onChange={() => toggleAssetSelection(asset.id)} aria-label={'Select '+asset.name} className="size-4 accent-[var(--vyra-accent-primary)]"/> Select</label><span className={'inline-flex items-center gap-1 text-[10px] '+(visibility === 'public' ? 'text-[var(--vyra-accent-primary)]' : muted)}>{visibility === 'public' ? (vyral.visibility === 'public' ? 'Public' : 'Public · Vyral private') : 'Private'}</span></div>
          <div className="min-w-0">
            <h4 className={'truncate text-sm font-semibold ' + primary}>{asset.name}</h4>
            <p className={'mt-1 text-[11px] capitalize ' + muted}>{asset.asset_type.replaceAll('_', ' ')}</p>
            {(() => {
              const fields = (asset.metadata?.ai_details as VyralAiDetails | undefined)?.fields ?? {};
              const category = typeof fields.category?.value === 'string' ? fields.category.value : '';
              const style = typeof fields.style?.value === 'string' ? fields.style.value : '';
              const tags = Array.isArray(fields.tags?.value) ? fields.tags.value.filter((tag): tag is string => typeof tag === 'string').slice(0, 3) : [];
              const values = [category, style, ...tags].filter(Boolean);
              return values.length ? <div className="mt-2 flex flex-wrap gap-1">{values.map((value,index)=><span key={value+index} className="max-w-full truncate rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-0.5 text-[9px] text-[var(--vyra-text-secondary)]">{value}</span>)}</div> : null;
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void openPreview(asset)} className={button}>Open</button>
            <button type="button" onClick={() => openAssetDetails(asset)} className={button}>Edit details</button>
            <button type="button" onClick={() => void updateAssetVisibility([asset.id], visibility === 'public' ? 'private' : 'public')} disabled={busy} className={button}>{visibility === 'public' ? 'Make private' : 'Make public'}</button>
            {isPackage && <button type="button" onClick={() => void importVyralPackageFromAsset(asset)} disabled={busy || packageBusy} className={button}>Import</button>}
            {protectedAsset
              ? <span className={'ml-auto text-[10px] ' + muted}>Protected</span>
              : <button type="button" onClick={() => void deleteAsset(asset)} aria-label={'Delete ' + asset.name} className={'ml-auto rounded-lg p-2 ' + muted + ' hover:text-[var(--vyra-danger)]'}><Trash2 size={15}/></button>}
          </div>
        </div>
      </article>
    );
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><span className={'text-xs ' + muted}>Loading Vyral workspace…</span></div>;

  return (
    <div className="space-y-5">
      {(packageBusy || busy) && <p className={'text-xs ' + muted} role="status">Please wait…</p>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-xs text-rose-500"><AlertCircle size={15} className="mt-0.5 shrink-0"/><span className="min-w-0 flex-1">That action could not be completed. Please try again.</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
      {collectionReferences.length > 0 && <section className={surface + ' space-y-3 p-3'}>
        <div className="flex items-center justify-between gap-3">
          <div><h3 className={'text-sm font-semibold ' + primary}>Collection references</h3><p className={'mt-1 text-[11px] ' + muted}>References are kept separate from this Vyral’s own Assets.</p></div>
          <span className={'text-[10px] ' + muted}>{collectionReferences.length}</span>
        </div>
        <div className="space-y-2">
          {collectionReferences.map((reference) => {
            const snapshotVyral = asRecord(reference.compact_snapshot.vyral);
            const label = typeof snapshotVyral.name === 'string' ? snapshotVyral.name : 'Referenced collection';
            const check = referenceChecks[reference.id];
            const importedAssets: PublicCollectionAssetReferenceV1[] = Array.isArray(reference.compact_snapshot.assets)
              ? reference.compact_snapshot.assets.map((value) => {
                  const asset = asRecord(value);
                  return { assetId: String(asset.asset_id ?? ''), assetVersionId: String(asset.asset_version_id ?? ''), mediaType: String(asset.media_type ?? 'application/octet-stream') };
                }).filter((asset) => /^[0-9a-f-]{36}$/i.test(asset.assetId) && /^[0-9a-f-]{36}$/i.test(asset.assetVersionId))
              : [];
            const checkLabel = check?.status === 'checking'
              ? 'Checking current access…'
              : check?.status === 'current'
                ? 'Collection DNA available · ' + check.assetCount + ' Assets'
                : check?.status === 'newer_revision'
                  ? 'New revision available · ' + check.revision
                  : check?.status === 'error'
                    ? check.message
                    : reference.resolver_uri ? 'Access has not been checked yet' : 'Identity reference only';
            return <div key={reference.id} className="rounded-lg border border-[var(--vyra-border-subtle)] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1"><p className={'truncate text-xs font-medium ' + primary}>{label}</p><p className={'mt-1 text-[10px] ' + muted}>Imported revision {reference.source_revision} · {reference.source_visibility === 'public' ? 'Public source' : reference.source_visibility === 'unlisted' ? 'Unlisted source' : 'Private source'}</p><p className={'mt-1 text-[10px] ' + (check?.status === 'error' ? 'text-rose-500' : muted)}>{checkLabel}</p></div>
                <div className="flex items-center gap-2">
                  {reference.resolver_uri && <button type="button" onClick={() => void checkCollectionReference(reference)} disabled={packageBusy || check?.status === 'checking'} className={button}>{check?.status === 'checking' ? 'Checking…' : 'Check collection DNA'}</button>}
                  <button type="button" onClick={() => void deleteCollectionReference(reference)} disabled={packageBusy} className={button}>Remove</button>
                </div>
              </div>
              {reference.resolver_uri && reference.source_visibility === 'public' && importedAssets.length > 0 && <div className="mt-3 space-y-2 border-t border-[var(--vyra-border-subtle)] pt-3">
                <p className={'text-[10px] ' + muted}>Source Assets · copying requires the creator’s current redistribution permission; copies are saved privately here</p>
                {importedAssets.map((assetReference) => <div key={assetReference.assetId + ':' + assetReference.assetVersionId} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0"><p className={'text-[11px] ' + primary}>{assetReference.mediaType}</p><p className={'text-[9px] ' + muted}>{assetReference.assetId.slice(0, 8)} · version {assetReference.assetVersionId.slice(0, 8)}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void exportReferencedAssetDna(reference, assetReference)} disabled={packageBusy || busy} className={button}>Export for AI</button>
                    <button type="button" onClick={() => void copyReferencedAsset(reference, assetReference)} disabled={packageBusy || busy} className={button}>Copy Asset here</button>
                  </div>
                </div>)}
              </div>}
            </div>;
          })}
        </div>
      </section>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className={'text-base font-semibold ' + primary}>Assets</h2>
          <p className={'mt-1 text-xs ' + subtle}>Everything in this Vyral, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--vyra-text-secondary)]">{vyral.visibility}</span>
          <label className={button + ' cursor-pointer'}>
            <Upload size={13}/> Import
            <input type="file" accept=".vyral,application/vnd.vyra.vyral+zip" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];event.target.value='';if(file)void importVyralPackage(file);}} disabled={busy || packageBusy}/>
          </label>
          <details className="relative">
            <summary className={primaryButton + ' cursor-pointer list-none'}>
              <Archive size={13}/>{packageBusy ? 'Working…' : 'Export'}
            </summary>
            <div className={'absolute right-0 z-30 mt-2 w-60 rounded-xl border p-2 ' + surface}>
              <p className={'px-2 py-1.5 text-[10px] ' + subtle}>Choose what to include</p>
              {([
                { label: 'Assets only', components: { assets: true, fullDna: false, compactDna: false } },
                { label: 'Rebuild data only', components: { assets: false, fullDna: true, compactDna: false } },
                { label: 'Collection reference only', components: { assets: false, fullDna: false, compactDna: true } },
                { label: 'Assets + rebuild data', components: { assets: true, fullDna: true, compactDna: false } },
                { label: 'Assets + collection reference', components: { assets: true, fullDna: false, compactDna: true } },
                { label: 'Rebuild + collection reference', components: { assets: false, fullDna: true, compactDna: true } },
                { label: 'Everything', components: { assets: true, fullDna: true, compactDna: true } },
              ] satisfies Array<{ label: string; components: VyralExportComponents }>).map(({ label, components }) => (
                <button
                  key={label}
                  type="button"
                  disabled={busy || packageBusy}
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    void exportVyralPackage(components);
                  }}
                  className="flex min-h-9 w-full items-center rounded-lg px-2.5 text-left text-xs text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)] disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>

      <section className={surface+' p-4'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <LockKeyhole size={16} className="shrink-0 text-[var(--vyra-accent-primary)]"/>
            <div className="min-w-0">
              <h3 className={'text-sm font-semibold '+primary}>System Files</h3>
              <p className={'mt-0.5 text-[10px] '+muted}>Protected package records · read-only · v{VYRAL_SYSTEM_FILES_VERSION}</p>
            </div>
          </div>
          <button type="button" onClick={()=>setShowSystemFiles(value=>!value)} aria-expanded={showSystemFiles} className={button}>
            {showSystemFiles?<EyeOff size={13}/>:<Eye size={13}/>} {showSystemFiles?'Hide':'Show'} System Files
          </button>
        </div>
        {showSystemFiles && <div className="mt-3 space-y-1.5 border-t border-[var(--vyra-border-subtle)] pt-3">
          {[
            {path:'manifest.json',label:'Package manifest',count:1,state:'present'},
            {path:'system/identity.json',label:'Vyral identity',count:1,state:'present'},
            {path:'system/asset-index.json',label:'Asset index',count:assets.length,state:'present'},
            {path:'system/asset-dna/index.json',label:'Asset DNA index',count:dnaRecords.filter(item=>item.asset_id).length,state:dnaRecords.some(item=>item.asset_id)?'present':'empty'},
            {path:'system/master-dna.ref.json',label:'Master DNA reference',count:masterDnaRevision,state:masterDnaAvailable&&masterDnaStatus==='ready'?'present':'not_available'},
            {path:'system/fingerprints/index.json',label:'Fingerprint index',count:fingerprints.length,state:fingerprints.length?'present':'empty'},
            {path:'system/provenance/index.json',label:'Provenance and lineage',count:lineage.length,state:lineage.length?'present':'empty'},
            {path:'system/relationships/index.json',label:'Relationship index',count:masterRelationships.length,state:masterRelationships.length?'present':'empty'},
            {path:'system/classifications/index.json',label:'Asset classifications',count:assets.length,state:'present'},
            {path:'system/creator-instructions/index.json',label:'Creator instructions',count:0,state:'not_available'},
            {path:'system/licensing.json',label:'Licensing policy',count:1,state:'present'},
            {path:'system/integrity.json',label:'Package integrity',count:0,state:'generated_on_export'},
            {path:'system/system-files.json',label:'Protected file index',count:12,state:'present'},
          ].map(file=><div key={file.path} className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--vyra-bg-subtle)] px-2.5 py-2">
            <FileText size={13} className="shrink-0 text-[var(--vyra-text-muted)]"/>
            <div className="min-w-0 flex-1"><p className={'truncate text-[11px] font-medium '+primary}>{file.path}</p><p className={'text-[9px] '+muted}>{file.label}</p></div>
            <span className={'shrink-0 text-[9px] '+muted}>{file.state==='present'?(file.count+' record'+(file.count===1?'':'s')):file.state==='empty'?'Empty':file.state==='generated_on_export'?'On export':'Not available'}</span>
            <LockKeyhole size={11} className="shrink-0 text-[var(--vyra-accent-primary)]"/>
          </div>)}
          <p className={'pt-1 text-[10px] leading-4 '+muted}>System Files are protected package views of existing VYRA records. They cannot be individually deleted. Their contents are validated again when a package is imported.</p>
        </div>}
      </section>

      {tab === 'overview' && (
        <div className="space-y-4">
          <section className={surface+' p-4'}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={'text-sm font-semibold '+primary}>About this Vyral</h3>
                <p className={'mt-1 text-xs '+subtle}>{vyral.description || 'A creative collection. Add Assets and VYRA will suggest useful details automatically.'}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(() => {
                    const fields = (vyral.metadata?.ai_details as VyralAiDetails | undefined)?.fields ?? {};
                    const values = [
                      typeof fields.category?.value === 'string' ? fields.category.value : '',
                      typeof fields.style?.value === 'string' ? fields.style.value : '',
                      ...(Array.isArray(fields.tags?.value) ? fields.tags.value.filter((tag): tag is string => typeof tag === 'string') : []),
                    ].filter(Boolean).slice(0, 8);
                    return values.map((value, index) => <span key={value+index} className="rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-1 text-[10px] text-[var(--vyra-text-secondary)]">{value}</span>);
                  })()}
                </div>
              </div>
              <button type="button" onClick={openCollectionDetails} className={button}>Edit details</button>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {label:'Assets',value:assets.length,icon:Folder},
              {label:'Folders',value:folders.length,icon:FolderPlus},
              {label:'Storage used',value:prettyBytes(totalBytes),icon:HardDrive},
              {label:'Collection updates',value:assets.length ? 'Automatic' : 'Waiting',icon:Folder},
            ].map(({label,value,icon:Icon})=><div key={label} className={surface+' p-3'}><div className={'flex items-center gap-2 text-[10px] '+muted}><Icon size={14}/>{label}</div><div className={'mt-2 text-xl font-semibold '+primary}>{value}</div></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <section className={surface+' p-4'}>
              <div className="flex items-center justify-between gap-2">
                <h3 className={'text-sm font-semibold '+primary}>Collection status</h3>
                <span className="rounded-full bg-[var(--vyra-bg-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--vyra-text-secondary)]">
                  {assets.length === 0 ? 'Ready for Assets' : masterDnaStatus === 'ready' ? 'Up to date' : 'Updating automatically'}
                </span>
              </div>
              <p className={'mt-2 text-xs leading-5 '+subtle}>
                VYRA automatically keeps collection and Asset information in sync as your library changes. You do not need to configure technical settings.
              </p>
              {masterDnaMessage && <p role="status" className={'mt-2 text-xs leading-5 '+muted}>{masterDnaMessage}</p>}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between border-t border-[var(--vyra-border-subtle)] pt-2">
                  <span className={'text-xs '+subtle}>Assets included</span>
                  <span className={'text-xs font-medium '+primary}>{assets.length}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--vyra-border-subtle)] pt-2">
                  <span className={'text-xs '+subtle}>Collection information</span>
                  <span className={'text-xs font-medium '+primary}>Maintained automatically</span>
                </div>
              </div>
            </section>
            <section className={surface+' p-4'}>
              <h3 className={'text-sm font-semibold '+primary}>Recent activity</h3>
              {assets.length ? <div className="mt-3 space-y-3">
                {assets.slice(0,5).map((item)=><div key={item.id} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--vyra-accent-primary)]"/>
                  <div className="min-w-0 flex-1"><p className={'text-xs font-medium '+primary}>Asset added</p><p className={'truncate text-[10px] '+muted}>{item.name}</p></div>
                  <time className={'shrink-0 text-[10px] '+muted}>{dateLabel(item.created_at)}</time>
                </div>)}
              </div> : <p className={'mt-3 text-xs '+muted}>Your first Assets will appear here.</p>}
            </section>
          </div>
          <section className={surface+' p-4'}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className={'text-sm font-semibold '+primary}>Asset library</h3><p className={'mt-1 text-xs '+muted}>Start by adding original source assets.</p></div><button type="button" onClick={()=>setTab('assets')} className={button}>Open asset library <ChevronRight size={13}/></button></div>
            {assets.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{assets.slice(0,4).map((asset)=>{const Icon=typeIcon(asset.asset_type);return <button key={asset.id} type="button" onClick={()=>{setTab('assets');void openPreview(asset);}} className="flex min-w-0 items-center gap-2 rounded-lg bg-[var(--vyra-bg-subtle)] p-2 text-left"><Icon size={16} className="shrink-0 text-[var(--vyra-accent-primary)]"/><span className={'truncate text-[10px] '+primary}>{asset.name}</span></button>})}</div> : <div className="mt-3 rounded-lg border border-dashed border-[var(--vyra-border)] p-6 text-center"><Upload size={20} className={'mx-auto '+muted}/><p className={'mt-2 text-xs '+subtle}>No assets yet. Upload an image, video, audio file, document or 3D model.</p><button type="button" onClick={()=>setTab('assets')} className={'mt-3 '+primaryButton}><Upload size={13}/> Add first asset</button></div>}
          </section>
        </div>
      )}

      {tab === 'assets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className={'text-sm font-semibold '+primary}>Your collection</h3><p className={'mt-1 text-xs '+muted}>Add files or folders to build your Vyral.</p></div>
            <label className={primaryButton+' cursor-pointer'}><Upload size={14}/>{busy?'Uploading…':'Add assets'}<input type="file" multiple className="hidden" onChange={(event)=>void uploadFiles(event)} disabled={busy || packageBusy || verifyingAssetId !== null}/></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1"><Search size={14} className={'absolute left-3 top-1/2 -translate-y-1/2 '+muted}/><input value={localSearch} onChange={(event)=>setLocalSearch(event.target.value)} placeholder="Search this Vyral" className={field+' pl-9'}/></div>
            <select value={assetFilter} onChange={(event)=>setAssetFilter(event.target.value)} className={field+' !w-auto !min-w-28'}><option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="document">Documents</option><option value="model_3d">3D models</option><option value="archive">Archives</option><option value="other">Other</option></select>
            <button type="button" onClick={()=>setFolderDialog(true)} disabled={busy || packageBusy || verifyingAssetId !== null} className={button}><FolderPlus size={14}/> New folder</button>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs"><button type="button" onClick={()=>setActiveFolderId(null)} className={activeFolderId===null?'font-semibold text-[var(--vyra-accent-primary)]':subtle}>Root</button>{folderPath.map((folder)=><React.Fragment key={folder.id}><ChevronRight size={12} className={muted}/><button type="button" onClick={()=>setActiveFolderId(folder.id)} className={folder.id===activeFolderId?'font-semibold text-[var(--vyra-accent-primary)]':subtle}>{folder.name}</button></React.Fragment>)}</div>
          {visibleFolders.length>0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{visibleFolders.map((folder)=><div key={folder.id} className={surface+' flex min-w-0 items-center gap-2 p-3'}><button type="button" onClick={()=>setActiveFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><Folder size={18} className="shrink-0 text-[var(--vyra-accent-primary)]"/><span className={'truncate text-xs font-medium '+primary}>{folder.name}</span></button><button type="button" onClick={()=>void deleteFolder(folder)} aria-label={'Delete '+folder.name} className={muted}><Trash2 size={13}/></button></div>)}</div>}
          {filteredAssets.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--vyra-border)] px-3 py-2"><label className={'inline-flex items-center gap-2 text-xs '+subtle}><input type="checkbox" checked={filteredAssets.length > 0 && filteredAssets.every((asset) => selectedAssetIds.includes(asset.id))} onChange={(event) => setSelectedAssetIds((current) => event.target.checked ? [...new Set([...current, ...filteredAssets.map((asset) => asset.id)])] : current.filter((id) => !filteredAssets.some((asset) => asset.id === id)))} className="size-4 accent-[var(--vyra-accent-primary)]"/> Select all in this view</label><span className={'text-xs '+muted}>{selectedAssets.length} selected</span>{selectedAssets.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void updateAssetVisibility(selectedAssetIds, 'private')} disabled={busy} className={button}>Make private</button><button type="button" onClick={() => void updateAssetVisibility(selectedAssetIds, 'public')} disabled={busy} className={button}>Make public</button><button type="button" onClick={() => setSelectedAssetIds([])} className={button}>Clear</button><button type="button" onClick={sendSelectedAssetsToChat} disabled={!onSendAssetsToChat} className={primaryButton}>Use in AI Chat</button></div>}</div>}
          {filteredAssets.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filteredAssets.map(renderAssetCard)}</div> : <div className="rounded-xl border border-dashed border-[var(--vyra-border)] px-5 py-12 text-center"><Folder size={25} className={'mx-auto '+muted}/><p className={'mt-3 text-sm font-semibold '+primary}>{assets.length?'No matching assets in this folder':'This folder is empty'}</p><p className={'mt-1 text-xs '+muted}>Add files or create folders to organize this Vyral.</p></div>}
          <p className={'text-[10px] '+muted}>{assets.length} items</p>
        </div>
      )}

      {tab === 'dna' && (
        <div className="space-y-4">
          <section className={surface+' p-4'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className={'text-sm font-semibold '+primary}>Collection identity</h3>
                <p className={'mt-1 max-w-2xl text-xs leading-5 '+muted}>
                  VYRA keeps this collection's identity and Asset information updated automatically. Add, remove or update Assets whenever you need to. Roles, purposes and relationships are optional.
                </p>
              </div>
              <span className="rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold text-[var(--vyra-text-secondary)]">
                {assets.length === 0 ? 'Waiting for Assets' : masterDnaStatus === 'ready' ? 'Up to date' : 'Updating automatically'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                <p className={'text-[10px] '+muted}>Assets in this collection</p>
                <p className={'mt-1 text-lg font-semibold '+primary}>{assets.length}</p>
              </div>
              <div className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                <p className={'text-[10px] '+muted}>Collection updates</p>
                <p className={'mt-1 text-sm font-semibold '+primary}>Automatic</p>
              </div>
            </div>
          </section>
          <section className={surface+' p-4'}>
            <h3 className={'text-sm font-semibold '+primary}>Notes for AI (optional)</h3>
            <p className={'mt-1 text-xs '+muted}>Add a detail or rule you want VYRA to keep in mind. You can leave this empty.</p>
            <form onSubmit={(event)=>void saveDnaNote(event)} className="mt-3 space-y-2">
              <label className="block">
                <span className={'mb-1 block text-[10px] '+muted}>Apply to</span>
                <select value={dnaAssetId} onChange={(event)=>setDnaAssetId(event.target.value)} className={field}>
                  <option value="vyral">Whole collection</option>
                  {assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}
                </select>
              </label>
              <textarea value={dnaNote} onChange={(event)=>setDnaNote(event.target.value)} rows={3} maxLength={4000}
                placeholder="Anything important VYRA should remember about this collection or Asset…"
                className={field+' min-h-24 py-2.5'}/>
              <div className="flex justify-end">
                <button type="submit" disabled={!dnaNote.trim()} className={primaryButton}><Plus size={13}/> Save note</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {tab === 'lineage' && (
        <section className={surface+' p-4'}>
          <div className="flex items-center gap-2"><GitBranch size={17} className="text-[var(--vyra-accent-primary)]"/><h3 className={'text-sm font-semibold '+primary}>Asset lineage</h3></div>
          <p className={'mt-1 text-xs '+muted}>Track which source asset each generated, edited or derived asset came from. Each output keeps its own identity.</p>
          {lineage.length ? <div className="mt-4 space-y-2">{lineage.map((item)=><div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--vyra-bg-subtle)] p-3"><span className={'text-xs font-medium '+primary}>{assets.find((asset)=>asset.id===item.parent_asset_id)?.name ?? 'Source asset'}</span><ChevronRight size={13} className={muted}/><span className="rounded-full border border-[var(--vyra-border)] px-2 py-1 text-[9px] capitalize text-[var(--vyra-text-secondary)]">{item.relation_kind.replaceAll('_',' ')}</span><ChevronRight size={13} className={muted}/><span className={'text-xs font-medium '+primary}>{assets.find((asset)=>asset.id===item.child_asset_id)?.name ?? 'Derived asset'}</span><time className={'ml-auto text-[10px] '+muted}>{dateLabel(item.created_at)}</time></div>)}</div> : <div className="mt-4 rounded-lg border border-dashed border-[var(--vyra-border)] p-8 text-center"><GitBranch size={22} className={'mx-auto '+muted}/><p className={'mt-2 text-xs font-semibold '+primary}>No lineage links yet</p><p className={'mt-1 text-[10px] '+muted}>Generated and edited assets will be linked to their source assets as those workflows are connected.</p></div>}
        </section>
      )}

      {tab === 'license' && (
        <section className={surface+' p-4'}>
          <div className="flex items-start gap-3"><LockKeyhole size={19} className="mt-0.5 text-[var(--vyra-accent-primary)]"/><div><h3 className={'text-sm font-semibold '+primary}>Usage permissions</h3><p className={'mt-1 text-xs leading-5 '+subtle}>These creator-defined rules are stored with this Vyral. They are policy metadata for the VYRA workflows; public distribution and enforcement need their own release checks.</p></div></div>
          <form onSubmit={(event)=>void saveLicense(event)} className="mt-4 space-y-3">
            {[
              ['allow_ai_analysis','Allow AI analysis','Permit AI systems to inspect assets and contribute observations.'],
              ['allow_ai_generation','Allow AI generation','Permit assets to be used as references for generated media.'],
              ['allow_remix','Allow remixing','Permit other users to edit or create derivatives.'],
              ['allow_redistribution','Allow redistribution','Permit redistribution of the original assets.'],
              ['commercial_use','Allow commercial use','Permit commercial use within the defined license.'],
              ['require_attribution','Require creator attribution','Require creator credit when the asset is used.'],
            ].map(([key,label,detail])=><label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--vyra-border-subtle)] p-3"><input type="checkbox" checked={Boolean(licenseDraft[key as keyof typeof licenseDraft])} onChange={(event)=>setLicenseDraft((current)=>({...current,[key]:event.target.checked}))} className="mt-0.5 accent-[var(--vyra-accent-primary)]"/><span className="min-w-0"><span className={'block text-xs font-semibold '+primary}>{label}</span><span className={'mt-1 block text-[10px] leading-4 '+muted}>{detail}</span></span></label>)}
            <div className="flex justify-end pt-2"><button type="submit" className={primaryButton} disabled={busy}><ShieldCheck size={13}/>{busy?'Saving…':'Save permissions'}</button></div>
          </form>
        </section>
      )}

      {folderDialog && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/65 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setFolderDialog(false);}}><section role="dialog" aria-modal="true" aria-labelledby="vyral-folder-title" className="w-full max-w-sm rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5 shadow-[var(--vyra-shadow-overlay)]"><div className="flex items-center justify-between"><h3 id="vyral-folder-title" className={'text-base font-bold '+primary}>New folder</h3><button type="button" onClick={()=>setFolderDialog(false)} aria-label="Close" className={muted}><X size={17}/></button></div><form onSubmit={(event)=>void createFolder(event)} className="mt-4 space-y-3"><input autoFocus required maxLength={100} value={folderName} onChange={(event)=>setFolderName(event.target.value)} placeholder="Folder name" className={field}/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setFolderDialog(false)} className={button}>Cancel</button><button type="submit" disabled={busy||!folderName.trim()} className={primaryButton}>Create folder</button></div></form></section></div>}

      {collectionDetailsOpen && <div className="fixed inset-0 z-[97] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCollectionDetailsOpen(false);}}><section role="dialog" aria-modal="true" aria-label="Edit Vyral details" className="w-full max-w-lg rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5"><div className="flex items-center justify-between gap-3"><div><h3 className={'text-sm font-semibold '+primary}>Vyral details</h3><p className={'mt-1 text-xs '+muted}>AI suggestions are defaults. You control every field.</p></div><button type="button" onClick={()=>setCollectionDetailsOpen(false)} className={button} aria-label="Close"><X size={15}/></button></div><div className="mt-4 space-y-3"><label className={'block space-y-1 text-xs '+subtle}><span>Name</span><input className={field} maxLength={100} value={collectionDraft.name} onChange={(event)=>setCollectionDraft((current)=>({...current,name:event.target.value}))}/></label><label className={'block space-y-1 text-xs '+subtle}><span>Description</span><textarea className={field+' min-h-20 py-2'} rows={3} maxLength={1000} value={collectionDraft.description} onChange={(event)=>setCollectionDraft((current)=>({...current,description:event.target.value}))}/></label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className={'block space-y-1 text-xs '+subtle}><span>Category</span><input className={field} value={collectionDraft.category} onChange={(event)=>setCollectionDraft((current)=>({...current,category:event.target.value}))}/></label><label className={'block space-y-1 text-xs '+subtle}><span>Style</span><input className={field} value={collectionDraft.style} onChange={(event)=>setCollectionDraft((current)=>({...current,style:event.target.value}))}/></label></div><label className={'block space-y-1 text-xs '+subtle}><span>Tags</span><input className={field} value={collectionDraft.tags} onChange={(event)=>setCollectionDraft((current)=>({...current,tags:event.target.value}))} placeholder="Comma-separated tags"/></label>
        {Object.entries(collectionExtraDraft).length > 0 && <section className="space-y-3 rounded-xl border border-[var(--vyra-border)] p-3"><p className={'text-[11px] font-semibold '+subtle}>Additional details</p>{Object.entries(collectionExtraDraft).map(([key,value]) => { const original = (vyral.metadata?.ai_details as VyralAiDetails | undefined)?.fields?.[key]?.value ?? null; const structured = original !== null && typeof original === 'object' && !(Array.isArray(original) && original.every((item)=>typeof item==='string')); return <label key={key} className={'block space-y-1 text-xs '+subtle}><span className="capitalize">{key.replaceAll('_',' ')}</span>{structured ? <textarea rows={3} className={field+' py-2 font-mono text-[11px]'} value={value} onChange={(event)=>setCollectionExtraDraft((current)=>({...current,[key]:event.target.value}))}/> : <input className={field} value={value} onChange={(event)=>setCollectionExtraDraft((current)=>({...current,[key]:event.target.value}))}/>}</label>;})}</section>}
      </div><div className="mt-5 flex justify-end gap-2"><button type="button" className={button} onClick={()=>setCollectionDetailsOpen(false)}>Cancel</button><button type="button" className={primaryButton} disabled={busy||!collectionDraft.name.trim()} onClick={()=>void saveCollectionDetails()}>{busy?'Saving…':'Save details'}</button></div></section></div>}
      {detailsAsset && <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget)setDetailsAsset(null);}}><section role="dialog" aria-modal="true" aria-label="Edit Asset details" className="w-full max-w-lg rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-5"><div className="flex items-center justify-between gap-3"><div><h3 className={'text-sm font-semibold '+primary}>Asset details</h3><p className={'mt-1 text-xs '+muted}>Edit any field. Your changes stay yours.</p></div><button type="button" onClick={()=>setDetailsAsset(null)} className={button} aria-label="Close"><X size={15}/></button></div><div className="mt-4 space-y-3"><label className={'block space-y-1 text-xs '+subtle}><span>Name</span><input className={field} maxLength={100} value={detailsDraft.name} onChange={(event)=>setDetailsDraft((current)=>({...current,name:event.target.value}))}/></label><label className={'block space-y-1 text-xs '+subtle}><span>Description</span><textarea className={field+' min-h-20 py-2'} rows={3} maxLength={1000} value={detailsDraft.description} onChange={(event)=>setDetailsDraft((current)=>({...current,description:event.target.value}))}/></label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className={'block space-y-1 text-xs '+subtle}><span>Category</span><input className={field} value={detailsDraft.category} onChange={(event)=>setDetailsDraft((current)=>({...current,category:event.target.value}))}/></label><label className={'block space-y-1 text-xs '+subtle}><span>Style</span><input className={field} value={detailsDraft.style} onChange={(event)=>setDetailsDraft((current)=>({...current,style:event.target.value}))}/></label></div><label className={'block space-y-1 text-xs '+subtle}><span>Tags</span><input className={field} value={detailsDraft.tags} onChange={(event)=>setDetailsDraft((current)=>({...current,tags:event.target.value}))} placeholder="Comma-separated tags"/></label>
        {Object.entries(detailsExtraDraft).length > 0 && <section className="space-y-3 rounded-xl border border-[var(--vyra-border)] p-3"><p className={'text-[11px] font-semibold '+subtle}>Additional details</p>{Object.entries(detailsExtraDraft).map(([key,value]) => { const original = (detailsAsset.metadata?.ai_details as VyralAiDetails | undefined)?.fields?.[key]?.value ?? null; const structured = original !== null && typeof original === 'object' && !(Array.isArray(original) && original.every((item)=>typeof item==='string')); return <label key={key} className={'block space-y-1 text-xs '+subtle}><span className="capitalize">{key.replaceAll('_',' ')}</span>{structured ? <textarea rows={3} className={field+' py-2 font-mono text-[11px]'} value={value} onChange={(event)=>setDetailsExtraDraft((current)=>({...current,[key]:event.target.value}))}/> : <input className={field} value={value} onChange={(event)=>setDetailsExtraDraft((current)=>({...current,[key]:event.target.value}))}/>}</label>;})}</section>}
      </div><div className="mt-5 flex justify-end gap-2"><button type="button" className={button} onClick={()=>setDetailsAsset(null)}>Cancel</button><button type="button" className={primaryButton} disabled={busy||!detailsDraft.name.trim()} onClick={()=>void saveAssetDetails()}>{busy?'Saving…':'Save details'}</button></div></section></div>}
      {previewAsset && <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget){setPreviewAsset(null);setPreviewUrl('');}}}><section role="dialog" aria-modal="true" aria-label={previewAsset.name} className="max-h-[90svh] w-full max-w-3xl overflow-auto rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-4 shadow-2xl"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className={'truncate text-sm font-semibold '+primary}>{previewAsset.name}</h3><p className={'mt-1 text-[10px] '+muted}>{previewAsset.asset_type.replace('_',' ')} · {prettyBytes(Number(previewAsset.size_bytes))}</p></div><button type="button" onClick={()=>{setPreviewAsset(null);setPreviewUrl('');}} aria-label="Close preview" className={button}><X size={15}/></button></div><div className="mt-4 flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-[var(--vyra-bg-subtle)] p-2">{!previewUrl?<span className={'text-xs '+muted}>Preparing secure preview…</span>:previewAsset.asset_type==='image'?<img src={previewUrl} alt={previewAsset.name} className="max-h-[65svh] max-w-full object-contain"/>:previewAsset.asset_type==='video'?<video src={previewUrl} controls className="max-h-[65svh] max-w-full"/>:previewAsset.asset_type==='audio'?<audio src={previewUrl} controls className="w-full"/>:<div className="p-8 text-center"><FileText size={32} className={'mx-auto '+muted}/><p className={'mt-3 text-xs '+subtle}>Preview is not available for this file type.</p><a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--vyra-accent-primary)]"><Download size={13}/> Open or download file</a></div>}</div></section></div>}
    </div>
  );
};
