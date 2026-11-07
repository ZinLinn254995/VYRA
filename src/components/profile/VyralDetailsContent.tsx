import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, Box, ChevronRight, Clock3, Dna,
  Download, File as FileIcon, FileText, Fingerprint, FlaskConical, Folder, FolderPlus, GitBranch,
  HardDrive, Image as ImageIcon, LockKeyhole, Music2, Pencil, Plus, Search, ShieldCheck,
  Trash2, Upload, Video, X,
} from 'lucide-react';
import { supabase, useAuth } from '../../context/AuthContext';
import { createVyralAssetDnaOnlyPackage, createVyralZip, encodeVyralDnaV3PngFromPackage, parseVyralManifest, readVyralZip, reconstructVyralDnaV3FromPackage, reconstructVyralFileDnaFromPackage, VYRAL_PACKAGE_FORMAT, VYRAL_PACKAGE_VERSION } from '../../services/vyralPackage';
import { validateVyralMasterDnaV1 } from '../../services/vyralMasterDnaV1';
import type { VyralDnaV3Record } from '../../services/vyralDnaV3';
import { createVyralFileDnaV1, type VyralFileDnaRecord } from '../../services/vyralFileDnaV1';

type Vyral = {
  id: string; name: string; description: string; visibility: 'private' | 'unlisted' | 'public';
  dna_status: string; license_policy?: Record<string, unknown>; metadata?: Record<string, unknown>;
  master_dna_status?: string; master_dna_revision?: number; master_dna_purpose?: string | null; master_dna_intended_uses?: string[];
};
type FolderRow = { id: string; vyral_id: string; parent_id: string | null; name: string; created_at: string };
type AssetRow = {
  id: string; vyral_id: string; folder_id: string | null; name: string; original_filename: string;
  asset_type: string; mime_type: string; size_bytes: number; storage_path: string; sha256: string | null;
  processing_status: string; description: string; created_at: string; updated_at: string;

};
type DnaRow = {
  id: string; asset_id: string | null; scope: string; dna_status: string; source_kind: string;
  verification_status: string; payload: Record<string, unknown>; created_at: string;
};
type FingerprintRow = { id: string; asset_id: string; asset_version_id: string | null; fingerprint_kind: string; algorithm: string; value: string; metadata?: Record<string, unknown>; created_at: string };
type ObservationRow = { id: string; asset_id: string; asset_version_id: string; task_kind: string; model_provider: string; model_id: string; confidence: number | null; verification_status: string; observation: Record<string, unknown>; evidence?: Record<string, unknown>; source_sha256: string; created_at: string };
type LineageRow = { id: string; parent_asset_id: string; child_asset_id: string; relation_kind: string; created_at: string };
type MasterRelationshipRow = { id: string; relationship_type: string; from_kind: 'asset' | 'vyral'; from_asset_id: string | null; to_kind: 'asset' | 'vyral'; to_asset_id: string | null; rationale: string };
type MasterAssetDraft = { role: '' | 'main' | 'supporting'; purpose: string; targetAssetId: string; rationale: string };
type ReconstructionRow = { id: string; asset_id: string; asset_version_id?: string | null; model_provider: string; model_id: string; protocol_version?: string; comparison_mode: string; test_status: string; exact_match: boolean | null; similarity_score: number | null; report?: Record<string, unknown>; created_at: string };
type AssetVersionRow = { id: string; asset_id: string; storage_path: string; version_number: number; mime_type: string; size_bytes: number; sha256: string | null; source_kind?: string; parent_version_id?: string | null; metadata?: Record<string, unknown>; created_at: string };
type Tab = 'overview' | 'assets' | 'dna' | 'lineage' | 'license';
type Props = { vyral: Vyral; searchQuery: string; onVyralUpdated: (patch: Partial<Vyral>) => void };

const isProtectedVyral = (item: Vyral) => item.id === 'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d' || item.metadata?.protected === true;
const surface = 'rounded-xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)]';
const muted = 'text-[var(--vyra-text-muted)]';
const subtle = 'text-[var(--vyra-text-secondary)]';
const primary = 'text-[var(--vyra-text-primary)]';
const field = 'min-h-10 w-full rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-canvas)] px-3 text-sm text-[var(--vyra-text-primary)] outline-none focus:border-[var(--vyra-accent-primary)] placeholder:text-[var(--vyra-text-muted)]';
const button = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-[var(--vyra-border)] px-3 text-xs font-semibold text-[var(--vyra-text-primary)] transition hover:bg-[var(--vyra-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50';
const primaryButton = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-[var(--vyra-accent-primary)] px-3 text-xs font-semibold text-slate-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';
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

export const VyralDetailsContent: React.FC<Props> = ({ vyral, searchQuery, onVyralUpdated }) => {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [packageBusy, setPackageBusy] = useState(false);
  const [verifyingAssetId, setVerifyingAssetId] = useState<string | null>(null);
  const [comparingReconstructionAssetId, setComparingReconstructionAssetId] = useState<string | null>(null);
  const [extractingDnaV3, setExtractingDnaV3] = useState(false);
  const [verifyingDnaV3, setVerifyingDnaV3] = useState(false);
  const [packageStatus, setPackageStatus] = useState('');
  const [reconstructedPngDownload, setReconstructedPngDownload] = useState<{ blob: Blob; filename: string } | null>(null);
  const [error, setError] = useState('');
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
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
  const [previewUrl, setPreviewUrl] = useState('');
  const [licenseDraft, setLicenseDraft] = useState({
    allow_ai_analysis: true, allow_ai_generation: true, allow_remix: false,
    allow_redistribution: false, commercial_use: false, require_attribution: true,
  });
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
    setVersions((results[2].data ?? []) as AssetVersionRow[]);
    setDnaRecords((results[3].data ?? []) as DnaRow[]);
    setFingerprints((fingerprintResult.data ?? []) as FingerprintRow[]);
    setObservations((observationResult.data ?? []) as ObservationRow[]);
    setLineage((results[4].data ?? []) as LineageRow[]);
    setReconstructionTests((results[5].data ?? []) as ReconstructionRow[]);
    const masterRootResult = results[6];
    const masterEdgesResult = results[7];
    const masterMetadataResult = results[8];
    const masterSchemaReady = !masterRootResult.error && !masterEdgesResult.error && !masterMetadataResult.error && Boolean(masterRootResult.data);
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
  }, [vyral.id, vyral.license_policy]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

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
  const exportVyralPackage = async (dnaOnly = false, selectedAssetId?: string) => {
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
      if (vyral.master_dna_status === 'ready') {
        const { data: revisionRow, error: revisionError } = await supabase
          .from('vyral_master_dna_revisions')
          .select('snapshot,revision')
          .eq('vyral_id', vyral.id)
          .eq('user_id', auth.user.id)
          .order('revision', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (revisionError) throw new Error('Could not load the current Master DNA snapshot for export.');
        if (revisionRow?.snapshot) {
          portableMasterDna = await validateVyralMasterDnaV1(revisionRow.snapshot);
          if (portableMasterDna.snapshot.revision !== Number(vyral.master_dna_revision)) {
            throw new Error('The Master DNA snapshot is not the current Vyral revision. Rebuild Master DNA before exporting.');
          }
        }
      }
      let totalMediaBytes = 0;
      const ownerless = <T extends Record<string, unknown>>(record: T) => {
        const { user_id: _userId, vyral_id: _vyralId, storage_path: _storagePath, ...safe } = record;
        return safe;
      };

      for (const asset of (dnaOnly ? [] : assets)) {
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
        exportMode: dnaOnly ? 'dna-only' : 'full',
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
        },
        ...(!selectedAssetId && portableMasterDna ? { masterDna: portableMasterDna } : {}),
        folders: folders.map((item) => ownerless(item as unknown as Record<string, unknown>)),
        assets: packageAssets.map((item) => ownerless(item as unknown as Record<string, unknown>)), 
        versions: packageVersions,
        dnaRecords: dnaRecords.filter((item) => !dnaOnly || !selectedAssetId || item.asset_id === selectedAssetId).map((item) => {
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
        fingerprints: (dnaOnly ? fingerprints.filter((item) => !item.asset_version_id) : fingerprints).map((item) => ownerless(item as unknown as Record<string, unknown>)),
        // DNA-only exports omit binary versions, so keep only evidence that is not bound to an omitted version.
        
        visionObservations: (dnaOnly ? observations.filter((item) => !item.asset_version_id) : observations).map((item) => ownerless(item as unknown as Record<string, unknown>)), 
        lineage: lineage.map((item) => ownerless(item as unknown as Record<string, unknown>)),
        reconstructionTests: (dnaOnly ? reconstructionTests.filter((item) => !item.asset_version_id) : reconstructionTests).map((item) => ownerless(item as unknown as Record<string, unknown>)), 
      };
      packageEntries.push({
        path: 'README.txt',
        data: [
          'VYRAL PORTABLE PACKAGE',
          'Format: ' + VYRAL_PACKAGE_FORMAT,
          'Version: ' + VYRAL_PACKAGE_VERSION,
          dnaOnly
            ? 'DNA-ONLY RECONSTRUCTION PACKAGE. Original version entries, previews and thumbnails are excluded; lossless raster sample tiles and non-raster File DNA source-byte chunks are included.'
            : 'This archive contains the Vyral manifest, identity records and original asset-version media.',
          dnaOnly
            ? 'Asset records are retained as metadata and original media-version entries are omitted. File DNA v1 chunks preserve exact non-raster source bytes; raster DNA v3 preserves decoded samples, not original encoded image bytes.'
            : 'SHA-256 values were recalculated from the downloaded media during export.',
          dnaOnly
            ? 'Raster assets use canonical decoded samples: top-to-bottom rows, left-to-right pixels, interleaved RGB/RGBA channels. Non-raster assets use lossless raw source-byte chunks with per-chunk and aggregate SHA-256 verification.'
            : 'DNA verification and reconstruction claims are evidence records; importing a package must not automatically trust them.',
          dnaOnly
            ? 'Raster DNA v3 does not recover original PNG/JPEG encoded bytes and does not independently verify the source decoder or unknown color space. File DNA v1 can recover exact original non-raster source bytes only when all declared lossless chunks pass verification. Legacy fingerprints, observations and version-bound evidence are excluded.'
            : 'Importing a package must not automatically trust its verification claims.',
          'ZIP entries use the standard Store method (no compression) for broad compatibility.'
        ].join('\n'),
      });
      const manifestJson = JSON.stringify(manifest, null, 2);
      if (new TextEncoder().encode(manifestJson).byteLength > 32 * 1024 * 1024) throw new Error('VYRAL manifest exceeds the 32 MB package limit. Reduce the number of large AI evidence records before exporting.');
      packageEntries.push({ path: 'manifest.json', data: manifestJson });
      let archive: Blob;
      if (!dnaOnly) {
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
        if (!selectedAssetId && (!portableMasterDna || vyral.master_dna_status !== 'ready')) {
          throw new Error('Build and verify the current Master DNA before exporting the whole Vyral as DNA-only.');
        }
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
            const fileDna = await createVyralFileDnaV1({
              record_id: String(identityRecord.record_id),
              source: { asset_id: asset.id, asset_version_id: sourceVersion.id },
              bytes: new Uint8Array(await sourceBlob.arrayBuffer()),
              mime_type: sourceVersion.mime_type || asset.mime_type || 'application/octet-stream',
              filename: asset.original_filename || asset.name,
              include_payload: true,
            });
            if (fileDna.record.file.sha256 !== String(source.sha256 ?? asRecord(identityRecord.file).sha256 ?? '').toLowerCase()) {
              throw new Error('The original binary for ' + asset.name + ' no longer matches its File DNA fingerprint.');
            }
            dnaPayloadEntries.push(...fileDna.entries);
            dnaRecordsForExport.push(fileDna.record);
          }
        }
        archive = await createVyralAssetDnaOnlyPackage(
          manifest as unknown as Parameters<typeof createVyralAssetDnaOnlyPackage>[0],
          dnaRecordsForExport,
          dnaPayloadEntries,
        );
      } else {
        archive = createVyralZip(packageEntries);
      }
      const url = window.URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      const safeName = vyral.name.trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'Vyral';
      anchor.href = url;
      anchor.download = safeName + (dnaOnly ? '-DNA-ONLY-TEST' : '') + '.vyral';
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

  const importVyralPackage = async (file: File) => {
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
        if (manifest.assets.length > 1 && !manifest.masterDna) {
          throw new Error('A multi-asset DNA-only package must include its Master DNA snapshot.');
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
      const assetCount = manifest.assets.length;
      const folderCount = manifest.folders.length;
      if (!window.confirm('Import "' + packageName + '" into "' + vyral.name + '"?\n\n' + assetCount + ' assets · ' + folderCount + ' folders · ' + manifest.versions.length + ' versions\n\nExisting content will not be overwritten. Imported verification claims will be marked unverified.')) {
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
      for (const sourceAsset of manifest.assets) {
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
          if (manifest.assets.length === 1) reconstructionDownload = { blob: new Blob([pngBuffer], { type: 'image/png' }), filename };
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
          metadata: { ...objectValue(sourceAsset.metadata), imported_from_package: manifest.packageId, imported_original_asset_id: oldAssetId, imported_original_created_at: sourceAsset.created_at ?? null, imported_original_updated_at: sourceAsset.updated_at ?? null, ...(reconstructedFromDnaV3 ? { reconstructed_from_dna_v3: true, original_encoded_source_sha256: reconstructedSourceSha256, original_encoded_source_bytes_recovered: false } : {}), ...(reconstructedFromFileDna ? { reconstructed_from_file_dna_v1: true, original_source_sha256: reconstructedSourceSha256, original_source_bytes_recovered: true } : {}) },
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
        completedAssets += 1;
        setPackageStatus('Restoring assets ' + completedAssets + ' / ' + manifest.assets.length + '…');
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
        const assetId = oldAssetId ? assetMap.get(oldAssetId) ?? null : null;
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
        }, objectValue(sourceRecord.reconstruction_data), isDnaV3Record ? 3 : 1, remappedDnaRecordId);
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

      // A verified Master DNA snapshot is still untrusted provenance on import.
      // Use its role/purpose/relationship declarations to seed owner-scoped
      // canonical metadata, then require a fresh local Master DNA build.
      if (importedMasterDna && masterDnaAvailable) {
        const membershipByAsset = new Map<string, (typeof importedMasterDna.relationships)[number]>();
        for (const relation of importedMasterDna.relationships) {
          if (relation.type === 'master_membership' && relation.from.kind === 'asset') {
            membershipByAsset.set(relation.from.asset_id, relation);
          }
        }
        for (const sourceAsset of importedMasterDna.assets) {
          const importedAssetId = assetMap.get(sourceAsset.asset_id);
          const membership = membershipByAsset.get(sourceAsset.asset_id);
          if (!importedAssetId || !membership) {
            throw new Error('Imported Master DNA is missing a valid membership relationship for an Asset.');
          }
          const targetAssetId = membership.to.kind === 'asset'
            ? assetMap.get(membership.to.asset_id) ?? null
            : null;
          if (membership.to.kind === 'asset' && !targetAssetId) {
            throw new Error('Imported Master DNA references a relationship target outside its Asset inventory.');
          }
          const { error: classificationError } = await supabase.rpc('set_vyral_master_dna_asset_classification', {
            p_asset_id: importedAssetId,
            p_role: sourceAsset.role,
            p_purpose: sourceAsset.purpose,
            p_target_asset_id: targetAssetId,
            p_rationale: membership.rationale,
          });
          if (classificationError) throw classificationError;
        }
        const additionalRelationships = importedMasterDna.relationships
          .filter((relation) => relation.type !== 'master_membership')
          .map((relation) => {
            const fromAssetId = relation.from.kind === 'asset' ? assetMap.get(relation.from.asset_id) : null;
            const toAssetId = relation.to.kind === 'asset' ? assetMap.get(relation.to.asset_id) : null;
            if ((relation.from.kind === 'asset' && !fromAssetId) || (relation.to.kind === 'asset' && !toAssetId)) {
              throw new Error('An imported Master DNA relationship references an Asset outside its inventory.');
            }
            return {
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
            };
          });
        for (let index = 0; index < additionalRelationships.length; index += 100) {
          const { error: relationshipError } = await supabase.from('vyral_asset_relationships').insert(additionalRelationships.slice(index, index + 100));
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

      await loadWorkspace();
      setReconstructedPngDownload(reconstructionDownload);
      setPackageStatus('Imported ' + assetCount + ' assets, ' + folderCount + ' folders and their identity evidence.' + (reconstructionDownload ? ' DNA v3 decoded samples were restored into a new PNG; original encoded file bytes were not recovered.' : '') + (importedMasterDna && masterDnaAvailable ? ' Master DNA roles, purposes and relationships were imported as unverified metadata; build a fresh local Master DNA revision.' : importedMasterDna ? ' Master DNA is preserved in the package, but this destination does not have the Master DNA database migration yet.' : ''));
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
    await importVyralPackage(new File([data], filename, { type: VYRAL_PACKAGE_FORMAT }));
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
    if (!supabase || !selected.length) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setError('Your session has expired. Please sign in again.'); return; }
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
          metadata: { upload_source: 'creator_workspace', hash_algorithm: 'SHA-256' },
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
            throw new Error(detail);
          }
          dnaCommitted = true;
        } else {
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
          const { error: dnaError } = await supabase.from('vyral_dna_records').insert({
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
              extraction_kind: 'deterministic_binary_file_identity',
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
        }
        const { error: readyError } = await supabase.from('vyral_assets').update({ processing_status: 'ready' }).eq('id', assetId);
        if (readyError) throw readyError;
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
  };

  const recoverAssetDna = async (asset: AssetRow) => {
    const userId = auth.user?.id;
    if (!supabase || !userId || busy || packageBusy || verifyingAssetId || asset.processing_status !== 'uploading') return;
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
      if (asset.asset_type !== 'image' || !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type.toLowerCase())) {
        throw new Error('Automatic DNA recovery without an existing record currently supports PNG, JPEG and WebP images only.');
      }

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

      const { data: readyAsset, error: readyError } = await supabase.from('vyral_assets')
        .update({ processing_status: 'ready' }).eq('id', asset.id).eq('user_id', userId).select('id').maybeSingle();
      if (readyError) throw readyError;
      if (!readyAsset) throw new Error('DNA v3 was saved, but the Asset ready state could not be updated. Retry Recover DNA to finalize safely.');
      setPackageStatus('Pinned server-side DNA v3 recovered and saved for ' + asset.name + '.');
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
    if (!supabase || !userId || busy || packageBusy || verifyingAssetId || asset.processing_status !== 'ready') return;
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
      setPackageStatus('Server verified SHA-256 for ' + asset.name + ' · ' + String(data.sha256).slice(0, 16) + '…');
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

  const renameAsset = async (asset: AssetRow) => {
    if (!supabase) return;
    const nextName = window.prompt('Asset name', asset.name)?.trim();
    if (!nextName || nextName === asset.name) return;
    const { error: updateError } = await supabase.from('vyral_assets').update({ name: nextName }).eq('id', asset.id);
    if (updateError) setError(updateError.message);
    else await loadWorkspace();
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
    if (updateError) setError(updateError.message);
    else onVyralUpdated({ license_policy: licenseDraft });
    setBusy(false);
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
    const isOriginReconstructionCandidate = ['a40f067c-0ed1-4b93-814f-4f2f925ff320', 'a63edc73-0247-4477-84b9-f942080de694', '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23'].includes(asset.id);
    const latestReconstructionTest = isOriginReconstructionCandidate
      ? reconstructionTests.filter((test) => test.asset_id === asset.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : undefined;
    const reconstructionReport = asRecord(latestReconstructionTest?.report);
    const reportProvenance = asRecord(reconstructionReport.provenance);
    const reconstructionInput = asRecord(reportProvenance.reconstructionInput);
    const comparisonInput = asRecord(reportProvenance.comparisonInput);
    const candidateDnaId = asset.id === '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23' ? '5460940d-4343-44bc-a109-a0141e5a17d4' : asset.id === 'a63edc73-0247-4477-84b9-f942080de694' ? '95b1ca66-01f5-4ecd-a679-bd891c8549ad' : '8856e567-0221-4011-b9c2-22c228faa449';
    const candidateDnaRecord = dnaRecords.find((record) => record.id === candidateDnaId);
    const recordedDnaProvenance = asRecord(asRecord(candidateDnaRecord?.payload).provenance);
    const integrityReport = asRecord(reconstructionReport.integrity);
    const originalIntegrity = asRecord(integrityReport.original);
    const candidateIntegrity = asRecord(integrityReport.candidate);
    const packageMode = reconstructionInput.packageMode ?? recordedDnaProvenance.input_package_mode ?? 'Unknown';
    const claudeUploadMismatch = asset.id === '8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23'
      ? asRecord(asRecord(candidateDnaRecord?.payload).upload_reconciliation)
      : null;
    const claudeModelReport = asRecord(asRecord(candidateDnaRecord?.payload).model_report);
    const claudeUploadRecord = asRecord(asRecord(candidateDnaRecord?.payload).upload);
    const exclusionIsUnverified = reconstructionInput.exposureIndependentlyVerifiedByComparator === false ||
      (!reconstructionInput.originalBinaryExposure && recordedDnaProvenance.source_binary_provided_to_model === false);
    const verifierDownloadedBoth = comparisonInput.originalBinaryDownloadedByVerifier === true &&
      comparisonInput.candidateBinaryDownloadedByVerifier === true ||
      (typeof originalIntegrity.actualSha256 === 'string' && typeof candidateIntegrity.actualSha256 === 'string');
    const originalReport = asRecord(reconstructionReport.original);
    const candidateReport = asRecord(reconstructionReport.candidate);
    const comparisonReport = asRecord(reconstructionReport.comparison);
    const pixelReport = asRecord(comparisonReport.pixelComparison);
    const normalizedImageReport = asRecord(comparisonReport.normalizedImageComparison);
    const geometryReport = asRecord(comparisonReport.redRegionGeometry);
    const geometrySimilarity = typeof geometryReport.geometrySimilarity === 'number' ? geometryReport.geometrySimilarity : null;
    const exactDecodedPixelMatch = typeof comparisonReport.exactDecodedPixelMatch === 'boolean'
      ? comparisonReport.exactDecodedPixelMatch
      : latestReconstructionTest?.exact_match === true;
    const backgroundDelta = comparisonReport.backgroundCornerColorEuclideanDelta;
    return (
      <article key={asset.id} className={surface + ' group min-w-0 overflow-hidden'}>
        <button type="button" onClick={() => void openPreview(asset)} className="flex aspect-[16/10] w-full items-center justify-center border-b border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]">
          <Icon size={34} strokeWidth={1.5} />
        </button>
        <div className="p-3">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1"><h4 className={'truncate text-xs font-semibold ' + primary}>{asset.name}</h4><p className={'mt-1 text-[10px] ' + muted}>{prettyBytes(Number(asset.size_bytes))} · {asset.asset_type.replace('_',' ')}</p></div>
            {isProtectedVyral(vyral) ? <span title="Protected Vyral asset — deletion disabled" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--vyra-accent-primary)]/30 bg-[var(--vyra-accent-primary)]/10 px-2 py-1 text-[9px] font-semibold text-[var(--vyra-accent-primary)]"><LockKeyhole size={11}/> Protected</span> : <button type="button" onClick={() => void deleteAsset(asset)} aria-label={'Delete ' + asset.name} className={'rounded-md p-1 ' + muted + ' hover:text-[var(--vyra-danger)]'}><Trash2 size={13}/></button>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">{asset.processing_status === 'uploading' && (asset.asset_type === 'image' || dnaRecords.some((record) => record.asset_id === asset.id && ((record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3) || (record.payload?.dna_schema_id === 'vyra.asset-file-dna' && record.payload?.dna_schema_version === 1))) ) && <button type='button' onClick={() => void recoverAssetDna(asset)} disabled={verifyingAssetId !== null || busy || packageBusy} className='text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50'>{verifyingAssetId===asset.id?'Recovering DNA…':'Recover DNA'}</button>}{(asset.original_filename.toLowerCase().endsWith('.vyral') || asset.name.toLowerCase().endsWith('.vyral')) && <button type="button" onClick={() => void importVyralPackageFromAsset(asset)} disabled={busy || packageBusy} className="text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50">Import .vyral</button>}<button type="button" onClick={() => void openPreview(asset)} className="text-[10px] font-semibold text-[var(--vyra-accent-primary)]">Preview</button><button type="button" onClick={() => void renameAsset(asset)} className={'text-[10px] ' + subtle}>Rename</button><button type="button" onClick={() => void verifyAssetIntegrity(asset)} disabled={verifyingAssetId !== null || comparingReconstructionAssetId !== null || busy || packageBusy} title="Recalculate SHA-256 from protected server-side storage" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50"><ShieldCheck size={11}/>{verifyingAssetId===asset.id?'Verifying…':'Verify'}</button>{asset.processing_status === 'ready' && asset.asset_type === 'image' && ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type.toLowerCase()) && !dnaRecords.some((record) => record.asset_id === asset.id && record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3) && <button type="button" onClick={() => void extractAssetDnaV3(asset)} disabled={verifyingAssetId !== null || busy || packageBusy || extractingDnaV3} title="Create immutable lossless decoded-sample DNA v3 from this verified source version" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50"><Dna size={11}/>{verifyingAssetId===asset.id?'Extracting…':'Create DNA v3'}</button>}{dnaRecords.some((record) => record.asset_id === asset.id && ((record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3) || (record.payload?.dna_schema_id === 'vyra.asset-file-dna' && record.payload?.dna_schema_version === 1))) && <button type="button" onClick={() => void exportVyralPackage(true, asset.id)} disabled={busy || packageBusy || verifyingAssetId !== null || comparingReconstructionAssetId !== null} title="Export this Asset's lossless DNA without requiring whole-Vyral Master DNA" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50"><Dna size={11}/>{packageBusy?'Exporting…':'Export DNA-only'}</button>}{['a40f067c-0ed1-4b93-814f-4f2f925ff320','a63edc73-0247-4477-84b9-f942080de694','8aae18f1-d75c-4c00-ab30-5a8f0d4a0a23'].includes(asset.id) && <button type="button" onClick={() => void compareOriginReconstruction(asset)} disabled={comparingReconstructionAssetId !== null || verifyingAssetId !== null || busy || packageBusy} title="Compare this blind reconstruction against the protected ORIGIN-01 original" className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--vyra-accent-primary)] disabled:opacity-50"><FlaskConical size={11}/>{comparingReconstructionAssetId===asset.id?'Comparing…':'Compare Original'}</button>}</div>{latestReconstructionTest && <div className={'mt-2 rounded-lg border border-[var(--vyra-border)] bg-[var(--vyra-bg-subtle)] p-2.5'}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={'text-[10px] font-semibold '+primary}>Latest test · {latestReconstructionTest.test_status}</p>
              <span className={'rounded-full px-2 py-1 text-[9px] font-semibold '+(exactDecodedPixelMatch === true ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-700')}>{exactDecodedPixelMatch === true ? 'Exact decoded pixels' : 'Exact reconstruction not verified'}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                <p className={'text-[9px] '+muted}>Geometry similarity</p>
                <p className={'mt-0.5 text-base font-semibold '+primary}>{geometrySimilarity !== null ? (geometrySimilarity*100).toFixed(2)+'%' : '—'}</p>
                <p className={'text-[9px] '+muted}>Red-region shape, scale and placement · not full-image similarity</p>
              </div>
              <div className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                <p className={'text-[9px] '+muted}>Normalized full-image similarity</p>
                <p className={'mt-0.5 text-base font-semibold '+primary}>{normalizedImageReport.performed === true && typeof normalizedImageReport.normalizedGridRgbSimilarity === 'number' ? (Number(normalizedImageReport.normalizedGridRgbSimilarity)*100).toFixed(2)+'%' : '—'}</p>
                <p className={'text-[9px] '+muted}>{normalizedImageReport.performed === true ? '256-grid RGB sample · resized-coordinate comparison' : String(normalizedImageReport.reason ?? 'Not available')}</p>
              </div>
              <div className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                <p className={'text-[9px] '+muted}>Background color delta</p>
                <p className={'mt-0.5 text-base font-semibold '+primary}>{typeof backgroundDelta === 'number' ? Number(backgroundDelta).toFixed(2) : '—'}</p>
                <p className={'text-[9px] '+muted}>RGB Euclidean distance · lower is closer</p>
              </div>
              <div className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                <p className={'text-[9px] '+muted}>Exact pixel comparison</p>
                <p className={'mt-0.5 text-xs font-semibold '+primary}>{pixelReport.performed === true ? (exactDecodedPixelMatch === true ? 'Matched' : 'Not matched') : 'Not evaluated'}</p>
                <p className={'text-[9px] '+muted}>{pixelReport.performed === true ? String(pixelReport.exactPixels ?? '—')+' / '+String(pixelReport.pixelCount ?? '—')+' pixels exact' : 'Not performed: dimensions differ'}</p>
              </div>
              <div className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                <p className={'text-[9px] '+muted}>Upload reconciliation</p>
                <p className={'mt-0.5 break-words text-[10px] font-semibold '+primary}>{String(claudeUploadMismatch?.status ?? 'Not applicable / not recorded').replaceAll('_',' ')}</p>
                <p className={'text-[9px] '+muted}>Stored candidate bytes are integrity-checked separately</p>
              </div>
            </div>
            <div className={'mt-2 space-y-1 text-[10px] '+muted}>
              <p>Reconstruction input: {String(packageMode)} package · Original exclusion: {exclusionIsUnverified ? 'creator-attested, not independently verified' : String(reconstructionInput.originalBinaryExposure ?? 'not recorded')}</p>
              <p>Verifier comparison: {verifierDownloadedBoth ? 'Original and candidate files downloaded after generation' : 'comparison input provenance unavailable'}</p>
              <p>Original: {String(originalReport.width ?? '—')} × {String(originalReport.height ?? '—')} · Background RGB ({formatRgb(originalReport.backgroundCornerAverageRgb)})</p>
              <p>Candidate: {String(candidateReport.width ?? '—')} × {String(candidateReport.height ?? '—')} · Background RGB ({formatRgb(candidateReport.backgroundCornerAverageRgb)})</p>
              {pixelReport.performed === false && <p>Pixel comparison note: {String(pixelReport.reason ?? 'Not performed')}</p>}
            </div>
          </div>}
          {claudeUploadMismatch && <div className={'mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-700'}><p className="font-semibold">Upload reconciliation: {String(claudeUploadMismatch.status ?? 'pending')}</p><p>Reported by Claude: {String(claudeModelReport.reported_size_bytes ?? '—')} bytes · SHA-256 prefix {String(claudeModelReport.reported_sha256_prefix ?? '—')}</p><p>Stored upload: {String(claudeUploadRecord.size_bytes ?? '—')} bytes · SHA-256 {String(claudeUploadRecord.sha256 ?? '—').slice(0, 16)}…</p><p>Comparison uses verified uploaded file bytes only; the reported output bytes have not been reconciled.</p></div>}
        </div>
      </article>
    );
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: HardDrive },
    { id: 'assets', label: 'Assets', icon: Folder },
    { id: 'dna', label: 'DNA & Identity', icon: Dna },
    { id: 'lineage', label: 'Lineage', icon: GitBranch },
    { id: 'license', label: 'License', icon: ShieldCheck },
  ];

  if (loading) return <div className="flex min-h-64 items-center justify-center"><span className={'text-xs ' + muted}>Loading Vyral workspace…</span></div>;

  return (
    <div className="space-y-5">
      {packageStatus && <p className={'text-[10px] '+muted} role="status">{packageStatus}</p>}
      {reconstructedPngDownload && <div className={surface+' flex flex-wrap items-center justify-between gap-3 p-3'}>
        <p className={'text-xs '+subtle}>DNA v3 reconstruction is stored in this Vyral as a new PNG.</p>
        <button type="button" className={button} onClick={() => {
          const url = window.URL.createObjectURL(reconstructedPngDownload.blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = reconstructedPngDownload.filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
        }}><Download size={13}/>Download reconstructed PNG</button>
      </div>}
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2.5 text-xs text-rose-500"><AlertCircle size={15} className="mt-0.5 shrink-0"/><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={14}/></button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><div className={'text-[10px] font-semibold uppercase tracking-[0.16em] ' + muted}>VYRAL WORKSPACE</div><p className={'mt-1 text-xs ' + subtle}>Your assets, identity records and evolving knowledge.</p></div>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--vyra-text-secondary)]">{vyral.visibility}</span><label className={button+' cursor-pointer'}><Upload size={13}/>Import .vyral<input type="file" accept=".vyral,application/vnd.vyra.vyral+zip" className="hidden" onChange={(event)=>{const file=event.target.files?.[0];event.target.value='';if(file)void importVyralPackage(file);}} disabled={busy || packageBusy}/></label><button type="button" onClick={() => void exportVyralPackage(false)} className={button} disabled={busy || packageBusy}><Archive size={13}/>{packageBusy?'Working…':'Export .vyral'}</button><button type="button" onClick={() => void exportVyralPackage(true)} className={button} disabled={busy || packageBusy || extractingDnaV3}><Dna size={13}/>{packageBusy?'Working…':'DNA-only Test'}</button>{isProtectedVyral(vyral) && <button type="button" onClick={() => void extractOriginDnaV3()} className={primaryButton} disabled={busy || packageBusy || extractingDnaV3 || verifyingDnaV3 || comparingReconstructionAssetId !== null || verifyingAssetId !== null}><Dna size={13}/>{extractingDnaV3?'Extracting DNA…':'Extract ORIGIN-01 DNA v3'}</button>}{isProtectedVyral(vyral) && dnaRecords.some((record) => record.asset_id === '2c496cd5-84c4-44b1-b02a-fca4265cc592' && record.payload?.dna_schema_id === 'vyra.asset-dna' && record.payload?.dna_schema_version === 3) && <button type="button" onClick={() => void verifyOriginDnaV3()} className={primaryButton} disabled={busy || packageBusy || extractingDnaV3 || verifyingDnaV3 || comparingReconstructionAssetId !== null || verifyingAssetId !== null}><Dna size={13}/>{verifyingDnaV3?'Verifying DNA…':'Verify DNA v3 Reconstruction'}</button>}<button type="button" onClick={() => void loadWorkspace()} className={button} disabled={busy || packageBusy || extractingDnaV3}><Clock3 size={13}/> Refresh</button></div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--vyra-border)] pb-1" aria-label="Vyral sections">
        {tabs.map(({id,label,icon:Icon}) => <button key={id} type="button" onClick={() => setTab(id)} className={'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ' + (tab===id ? 'bg-[var(--vyra-bg-hover)] text-[var(--vyra-accent-primary)]' : subtle)}><Icon size={14}/>{label}</button>)}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {label:'Assets',value:assets.length,icon:Folder},
              {label:'Folders',value:folders.length,icon:FolderPlus},
              {label:'Stored data',value:prettyBytes(totalBytes),icon:HardDrive},
              {label:'Knowledge records',value:dnaRecords.length,icon:Dna},
            ].map(({label,value,icon:Icon})=><div key={label} className={surface+' p-3'}><div className={'flex items-center gap-2 text-[10px] '+muted}><Icon size={14}/>{label}</div><div className={'mt-2 text-xl font-semibold '+primary}>{value}</div></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <section className={surface+' p-4'}>
              <div className="flex items-center justify-between gap-2"><h3 className={'text-sm font-semibold '+primary}>Identity status</h3><span className="rounded-full bg-[var(--vyra-bg-subtle)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--vyra-text-secondary)]">{vyral.dna_status.replaceAll('_',' ')}</span></div>
              <p className={'mt-2 text-xs leading-5 '+subtle}>Vyral DNA grows from creator-defined facts, source assets, AI observations and verified reconstruction evidence. It is not marked complete by record count alone.</p>
              <div className="mt-4 space-y-2">
                {[
                  ['Creator identity','Stored with the Vyral'],
                  ['Asset fingerprints',fingerprints.length+' cryptographic or analysis fingerprints'],
                  ['AI observations',observations.length+' recorded observations'],
                  ['DNA-only reconstruction',reconstructionTests.length+' test records · '+(reconstructionTests.some((item)=>item.test_status==='passed'&&item.exact_match===true)?'exact match verified':'not yet verified')],
                ].map(([label,value])=><div key={label} className="flex items-start justify-between gap-3 border-t border-[var(--vyra-border-subtle)] pt-2 first:border-0 first:pt-0"><span className={'text-xs '+subtle}>{label}</span><span className={'text-right text-[10px] '+muted}>{value}</span></div>)}
              </div>
            </section>
            <section className={surface+' p-4'}>
              <h3 className={'text-sm font-semibold '+primary}>Recent activity</h3>
              {dnaRecords.length || assets.length ? <div className="mt-3 space-y-3">
                {[
                  ...assets.slice(0,3).map((item)=>({id:item.id,title:'Asset added',detail:item.name,at:item.created_at})),
                  ...dnaRecords.slice(0,3).map((item)=>({id:item.id,title:'DNA record added',detail:item.scope+' · '+item.source_kind,at:item.created_at})),
                ].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5).map((item)=><div key={item.id} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--vyra-accent-primary)]"/><div className="min-w-0 flex-1"><p className={'text-xs font-medium '+primary}>{item.title}</p><p className={'truncate text-[10px] '+muted}>{item.detail}</p></div><time className={'shrink-0 text-[10px] '+muted}>{dateLabel(item.at)}</time></div>)}
              </div> : <p className={'mt-3 text-xs '+muted}>Your first assets and DNA records will appear here.</p>}
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
            <div><h3 className={'text-sm font-semibold '+primary}>Asset library</h3><p className={'mt-1 text-xs '+muted}>Original files are stored privately; metadata and identity records are stored separately.</p></div>
            <label className={primaryButton+' cursor-pointer'}><Upload size={14}/>{busy?'Uploading…':'Add assets'}<input type="file" multiple className="hidden" onChange={(event)=>void uploadFiles(event)} disabled={busy || packageBusy || verifyingAssetId !== null}/></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1"><Search size={14} className={'absolute left-3 top-1/2 -translate-y-1/2 '+muted}/><input value={localSearch} onChange={(event)=>setLocalSearch(event.target.value)} placeholder="Search this Vyral" className={field+' pl-9'}/></div>
            <select value={assetFilter} onChange={(event)=>setAssetFilter(event.target.value)} className={field+' !w-auto !min-w-28'}><option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="audio">Audio</option><option value="document">Documents</option><option value="model_3d">3D models</option><option value="archive">Archives</option><option value="other">Other</option></select>
            <button type="button" onClick={()=>setFolderDialog(true)} disabled={busy || packageBusy || verifyingAssetId !== null} className={button}><FolderPlus size={14}/> New folder</button>
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs"><button type="button" onClick={()=>setActiveFolderId(null)} className={activeFolderId===null?'font-semibold text-[var(--vyra-accent-primary)]':subtle}>Root</button>{folderPath.map((folder)=><React.Fragment key={folder.id}><ChevronRight size={12} className={muted}/><button type="button" onClick={()=>setActiveFolderId(folder.id)} className={folder.id===activeFolderId?'font-semibold text-[var(--vyra-accent-primary)]':subtle}>{folder.name}</button></React.Fragment>)}</div>
          {visibleFolders.length>0 && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{visibleFolders.map((folder)=><div key={folder.id} className={surface+' flex min-w-0 items-center gap-2 p-3'}><button type="button" onClick={()=>setActiveFolderId(folder.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left"><Folder size={18} className="shrink-0 text-[var(--vyra-accent-primary)]"/><span className={'truncate text-xs font-medium '+primary}>{folder.name}</span></button><button type="button" onClick={()=>void deleteFolder(folder)} aria-label={'Delete '+folder.name} className={muted}><Trash2 size={13}/></button></div>)}</div>}
          {filteredAssets.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{filteredAssets.map(renderAssetCard)}</div> : <div className="rounded-xl border border-dashed border-[var(--vyra-border)] px-5 py-12 text-center"><Folder size={25} className={'mx-auto '+muted}/><p className={'mt-3 text-sm font-semibold '+primary}>{assets.length?'No matching assets in this folder':'This folder is empty'}</p><p className={'mt-1 text-xs '+muted}>Add files or create folders to organize this Vyral.</p></div>}
          <p className={'text-[10px] '+muted}>{assets.length} assets · {prettyBytes(totalBytes)} total · 100 MB maximum per upload in this foundation</p>
        </div>
      )}

      {tab === 'dna' && (
        <div className="space-y-4">
          <section className={surface+' p-4'}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className={'text-sm font-semibold '+primary}>Vyral Master DNA</h3><p className={'mt-1 max-w-2xl text-xs leading-5 '+muted}>Describe the purpose of this Vyral, classify every Asset, and connect each Asset to the Vyral root or another Asset. No purpose or relationship is guessed from filenames.</p></div>
              <span className="rounded-full border border-[var(--vyra-border)] px-2.5 py-1 text-[10px] font-semibold capitalize text-[var(--vyra-text-secondary)]">{masterDnaStatus.replaceAll('_',' ')} · rev {masterDnaRevision}</span>
            </div>
            <form onSubmit={(event)=>void saveMasterDnaPurpose(event)} className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2"><span className={'mb-1 block text-[10px] font-semibold '+subtle}>What is this Vyral for?</span><textarea value={masterDnaPurposeDraft} onChange={(event)=>setMasterDnaPurposeDraft(event.target.value)} rows={2} maxLength={2000} className={field+' py-2'} placeholder="Describe the Vyral's overall purpose and identity."/></label>
              <label className="block"><span className={'mb-1 block text-[10px] font-semibold '+subtle}>Intended uses (comma-separated)</span><input value={masterDnaUsesDraft} onChange={(event)=>setMasterDnaUsesDraft(event.target.value)} className={field} placeholder="storyboarding, video_generation"/></label>
              <div className="flex items-end"><button type="submit" className={button} disabled={!masterDnaAvailable || masterDnaSaving || masterDnaBuilding}>{masterDnaSaving?'Saving…':'Save Vyral purpose'}</button></div>
            </form>
            {assets.length === 0 ? <p className={'mt-3 text-xs '+muted}>Add at least one Asset before building Master DNA.</p> : <div className="mt-4 space-y-3">
              <div><h4 className={'text-xs font-semibold '+primary}>Asset roles, purposes and relationships</h4><p className={'mt-1 text-[10px] '+muted}>Main and Supporting are organizational roles. A relationship may point to the Vyral root or any other Asset, with a clear reason.</p></div>
              {assets.map((asset) => {
                const draft = masterAssetDrafts[asset.id] ?? { role: '', purpose: '', targetAssetId: '__vyral__', rationale: '' };
                return <article key={asset.id} className="rounded-lg border border-[var(--vyra-border-subtle)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className={'text-xs font-semibold '+primary}>{asset.name}</p><span className={'text-[9px] '+muted}>{masterAssetDrafts[asset.id]?.role || 'role not set'}</span></div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <label><span className={'mb-1 block text-[10px] '+subtle}>Role</span><select value={draft.role} onChange={(event)=>updateMasterAssetDraft(asset.id,{role:event.target.value as MasterAssetDraft['role']})} className={field}><option value="">Choose role</option><option value="main">Main Asset</option><option value="supporting">Supporting Asset</option></select></label>
                    <label><span className={'mb-1 block text-[10px] '+subtle}>Purpose</span><input value={draft.purpose} onChange={(event)=>updateMasterAssetDraft(asset.id,{purpose:event.target.value})} className={field} maxLength={2000} placeholder="Why does this Asset belong here?"/></label>
                    <label><span className={'mb-1 block text-[10px] '+subtle}>Related to</span><select value={draft.targetAssetId} onChange={(event)=>updateMasterAssetDraft(asset.id,{targetAssetId:event.target.value})} className={field}><option value="__vyral__">Vyral root</option>{assets.filter((candidate)=>candidate.id!==asset.id).map((candidate)=><option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
                    <label><span className={'mb-1 block text-[10px] '+subtle}>Relationship reason</span><input value={draft.rationale} onChange={(event)=>updateMasterAssetDraft(asset.id,{rationale:event.target.value})} className={field} maxLength={2000} placeholder="How does it relate?"/></label>
                  </div>
                  <div className="mt-3 flex justify-end"><button type="button" className={button} onClick={()=>void saveMasterAssetClassification(asset)} disabled={!masterDnaAvailable || masterDnaSaving || masterDnaBuilding}>{masterDnaSaving?'Saving…':'Save Asset DNA structure'}</button></div>
                </article>;
              })}
            </div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--vyra-border-subtle)] pt-3">
              <p className={'text-[10px] '+muted}>Master DNA is a compact snapshot. Full Asset DNA and original media stay in this Vyral.</p>
              <button type="button" className={primaryButton} onClick={()=>void buildMasterDna()} disabled={!masterDnaAvailable || masterDnaBuilding || masterDnaSaving || !assets.length}><Dna size={13}/>{masterDnaBuilding?'Building Master DNA…':'Build Master DNA'}</button>
            </div>
            {masterDnaMessage && <p className={'mt-3 text-xs '+subtle} role="status">{masterDnaMessage}</p>}
            {masterDnaBlockers.length > 0 && <div className="mt-3 rounded-lg border border-[var(--vyra-border)] p-3" role="status"><div className="flex items-center justify-between gap-2"><p className={'text-xs font-semibold '+primary}>Master DNA requirements</p><span className={'text-[10px] '+muted}>{masterDnaBlockers.length} item(s) to resolve</span></div><ul className="mt-2 space-y-2">{masterDnaBlockers.map((blocker,index)=><li key={blocker.code+'-'+(blocker.asset_id??'root')+'-'+index} className="flex gap-2 text-xs"><span className={'mt-0.5 '+muted}>•</span><span className={subtle}>{blocker.asset_id ? (assets.find((asset)=>asset.id===blocker.asset_id)?.name ?? 'Asset')+': ' : ''}{blocker.message}</span></li>)}</ul></div>}
            {masterRelationships.length > 0 && <p className={'mt-2 text-[9px] '+muted}>{masterRelationships.length} relationship edge(s) currently stored.</p>}
          </section>
          <section className={surface+' p-4'}>
            <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--vyra-bg-subtle)] text-[var(--vyra-accent-primary)]"><Dna size={21}/></span><div><h3 className={'text-sm font-semibold '+primary}>Knowledge DNA</h3><p className={'mt-1 text-xs leading-5 '+subtle}>Structured, sourced knowledge that AI can use to understand and reconstruct this Vyral. Creator-defined facts remain authoritative; AI observations are stored as evidence, not silently promoted to truth.</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{[
              ['DNA records',dnaRecords.length],['Fingerprints',fingerprints.length],['Vision observations',observations.length],['Reconstruction tests',reconstructionTests.length],
            ].map(([label,value])=><div key={label} className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3"><p className={'text-[10px] '+muted}>{label}</p><p className={'mt-1 text-lg font-semibold '+primary}>{value}</p></div>)}</div>
          </section>
          <section className={surface+' p-4'}>
            <h3 className={'text-sm font-semibold '+primary}>Add creator knowledge</h3><p className={'mt-1 text-xs '+muted}>Record a fact, rule or identity detail you want VYRA to preserve.</p>
            <form onSubmit={(event)=>void saveDnaNote(event)} className="mt-3 space-y-2">
              <select value={dnaAssetId} onChange={(event)=>setDnaAssetId(event.target.value)} className={field}><option value="vyral">Whole Vyral identity</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>
              <textarea value={dnaNote} onChange={(event)=>setDnaNote(event.target.value)} rows={3} maxLength={4000} placeholder="Example: This character's eye color is always deep green. This is a creator-confirmed identity rule." className={field+' min-h-24 py-2.5'}/>
              <div className="flex justify-end"><button type="submit" disabled={!dnaNote.trim()} className={primaryButton}><Plus size={13}/> Save DNA record</button></div>
            </form>
          </section>
          <section className={surface+' p-4'}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={'text-sm font-semibold '+primary}>DNA record history</h3><select value={dnaAssetId} onChange={(event)=>setDnaAssetId(event.target.value)} className={field+' !w-auto'}><option value="">All records</option><option value="vyral">Vyral-level</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></div>
            <div className="mt-3 space-y-2">{selectedDnaRecords.length ? selectedDnaRecords.map((record)=><article key={record.id} className="rounded-lg border border-[var(--vyra-border-subtle)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className={'text-xs font-semibold capitalize '+primary}>{record.scope} DNA · {record.source_kind}</span><span className="rounded-full bg-[var(--vyra-bg-subtle)] px-2 py-1 text-[10px] capitalize text-[var(--vyra-text-secondary)]">{record.verification_status.replaceAll('_',' ')}</span></div><p className={'mt-2 text-xs '+subtle}>{typeof record.payload.creator_statement === 'string' ? record.payload.creator_statement : record.payload.identity ? JSON.stringify(record.payload.identity) : record.payload.source ? JSON.stringify(record.payload.source) : 'Structured DNA data recorded.'}</p>{record.payload.dna_schema_id === 'vyra.asset-file-dna' && (() => { const fileDna = asRecord(record.payload.dna_record); const structure = asRecord(fileDna.structure); const facts = Array.isArray(structure.facts) ? structure.facts.slice(0, 12).map((item) => asRecord(item)) : []; const notes = Array.isArray(structure.notes) ? structure.notes.filter((item): item is string => typeof item === 'string').slice(0, 3) : []; return <div className="mt-3 rounded-lg bg-[var(--vyra-bg-subtle)] p-3"><div className="flex flex-wrap items-center gap-2"><span className={'text-[10px] font-semibold capitalize '+primary}>Structure · {String(structure.profile ?? 'unknown').replaceAll('_',' ')}</span><span className={'text-[9px] '+muted}>{String(structure.status ?? 'unknown').replaceAll('_',' ')}</span></div>{facts.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{facts.map((fact,index)=><span key={String(fact.key)+index} className="rounded-md border border-[var(--vyra-border-subtle)] px-2 py-1 text-[9px] text-[var(--vyra-text-secondary)]">{String(fact.key).replaceAll('_',' ')}: {String(fact.value)}{fact.unit ? ' '+String(fact.unit) : ''}</span>)}</div>}{notes.map((note,index)=><p key={index} className={'mt-2 text-[9px] '+muted}>{note}</p>)}</div>; })()}<time className={'mt-2 block text-[10px] '+muted}>{dateLabel(record.created_at)}</time></article>) : <p className={'py-6 text-center text-xs '+muted}>No DNA records match this filter.</p>}</div>
          </section>
          <section className={surface+' p-4'}>
            <h3 className={'text-sm font-semibold '+primary}>Fingerprint registry</h3><p className={'mt-1 text-xs '+muted}>Fingerprints identify or compare assets. SHA-256 can be verified against protected Storage by the server. Perceptual, semantic and structural fingerprints require their own analysis pipelines; imported claims remain unverified until independently checked.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{['cryptographic','perceptual','semantic','structural'].map((kind)=>{const list=fingerprints.filter((item)=>item.fingerprint_kind===kind);return <div key={kind} className="rounded-lg border border-[var(--vyra-border-subtle)] p-3"><div className="flex items-center gap-2"><Fingerprint size={15} className="text-[var(--vyra-accent-primary)]"/><span className={'text-xs font-semibold capitalize '+primary}>{kind}</span><span className={'ml-auto text-[10px] '+muted}>{list.length} records</span></div>{list.length?list.slice(0,2).map((item)=><div key={item.id} className="mt-2"><p className={'break-all font-mono text-[10px] '+muted}>{item.algorithm}: {item.value}</p><p className={'mt-1 text-[9px] '+(item.metadata?.verification_status==='server_verified'&&item.metadata?.comparison_status==='matched'?'text-emerald-500':item.metadata?.comparison_status==='mismatch'?'text-rose-500':item.metadata?.comparison_status==='baseline_created'?'text-sky-500':muted)}>{item.metadata?.verification_status==='server_verified'?(item.metadata?.comparison_status==='matched'?'Server verified · match':item.metadata?.comparison_status==='baseline_created'?'Server hash baseline created':'Server hash recorded · mismatch'):'Unverified evidence'}</p></div>):<p className={'mt-2 text-[10px] '+muted}>Not generated yet</p>}</div>})}</div>
          </section>
          <section className={surface+' p-4'}>
            <h3 className={'text-sm font-semibold '+primary}>AI Vision evidence</h3>
            <p className={'mt-1 text-xs '+muted}>Observations remain separate from creator-confirmed identity rules until they are reviewed or corroborated. This recorder stores externally generated model output; it does not call an AI provider or claim provider-authenticated provenance.</p>
            <form onSubmit={(event)=>void saveVisionObservation(event)} className="mt-3 space-y-2 rounded-lg border border-[var(--vyra-border-subtle)] p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Source asset</span><select required value={visionAssetId} onChange={(event)=>{setVisionAssetId(event.target.value);setVisionVersionId('');}} className={field}><option value="">Select asset</option>{assets.map((asset)=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Source version</span><select required value={visionVersionId} onChange={(event)=>setVisionVersionId(event.target.value)} className={field}><option value="">Select version</option>{versions.filter((version)=>version.asset_id===visionAssetId).sort((a,b)=>b.version_number-a.version_number).map((version)=><option key={version.id} value={version.id}>Version {version.version_number} · {version.sha256?'SHA-256 recorded':'No hash'}</option>)}</select></label>
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Analysis task</span><select value={visionTaskKind} onChange={(event)=>setVisionTaskKind(event.target.value)} className={field}><option value="identity">Identity</option><option value="description">Description</option><option value="consistency">Consistency</option><option value="generation_context">Generation context</option><option value="reconstruction">Reconstruction</option><option value="safety">Safety</option><option value="other">Other</option></select></label>
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Model provider / source</span><input required maxLength={80} value={visionProvider} onChange={(event)=>setVisionProvider(event.target.value)} className={field} placeholder="e.g. OpenRouter, Gemini"/></label>
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Model identifier</span><input required maxLength={160} value={visionModel} onChange={(event)=>setVisionModel(event.target.value)} className={field} placeholder="Exact model name or ID"/></label>
                <label className={'space-y-1 text-[10px] '+muted}><span className="block">Model-reported confidence (optional, 0–1)</span><input type="number" min="0" max="1" step="0.0001" value={visionConfidence} onChange={(event)=>setVisionConfidence(event.target.value)} className={field} placeholder="e.g. 0.82"/></label>
              </div>
              <label className={'block space-y-1 text-[10px] '+muted}><span>Structured observation (JSON)</span><textarea required rows={6} maxLength={65536} value={visionJson} onChange={(event)=>setVisionJson(event.target.value)} className={field+' min-h-32 py-2.5 font-mono text-[11px]'} /></label>
              <div className="flex flex-wrap items-center justify-between gap-2"><p className={'max-w-xl text-[10px] leading-4 '+muted}>The server rechecks the private source file's SHA-256 and size. Provider/model labels are recorded as user-supplied claims, not verified credentials.</p><button type="submit" disabled={savingVision||!visionAssetId||!visionVersionId||!visionProvider.trim()||!visionModel.trim()} className={primaryButton}><Plus size={13}/>{savingVision?'Recording…':'Record observation'}</button></div>
            </form>

            {visionComparisonGroups.length > 0 && <section className="mt-4 rounded-lg border border-[var(--vyra-border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className={'text-xs font-semibold '+primary}>Multi-model comparison</h4><p className={'mt-1 text-[10px] '+muted}>Only observations from the exact same asset version and task are grouped. This is deterministic JSON field comparison, not semantic AI judgement.</p></div><span className={'text-[10px] '+muted}>{visionComparisonGroups.length} version/task groups</span></div>
              <div className="mt-3 space-y-3">{visionComparisonGroups.slice(0,8).map((group) => {
                const first = group.items[0];
                const version = versions.find((item) => item.id === first.asset_version_id);
                const asset = assets.find((item) => item.id === first.asset_id);
                const sameCount = group.comparisons.filter((item) => item.same).length;
                const differentCount = group.comparisons.length - sameCount;
                return <article key={group.key} className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className={'text-xs font-semibold '+primary}>{asset?.name ?? 'Asset'} · {first.task_kind.replaceAll('_',' ')}</p><p className={'mt-1 text-[10px] '+muted}>Version {version?.version_number ?? 'unknown'} · {group.items.length} observations · {group.modelCount} model labels</p><p className={'mt-1 break-all font-mono text-[9px] '+muted}>SHA-256: {first.source_sha256 || 'not recorded'}</p></div><div className="flex gap-2 text-[9px]"><span className="rounded bg-[var(--vyra-bg-canvas)] px-2 py-1 text-emerald-500">{sameCount} same</span><span className="rounded bg-[var(--vyra-bg-canvas)] px-2 py-1 text-amber-500">{differentCount} different</span></div></div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">{group.items.map((entry) => <div key={entry.id} className="min-w-0 rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2"><p className={'text-[10px] font-semibold '+primary}>{entry.model_provider} · {entry.model_id}</p><pre className={'mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[9px] leading-4 '+subtle}>{JSON.stringify(entry.observation, null, 2)}</pre></div>)}</div>
                  {group.comparisons.length > 0 && <div className="mt-3 space-y-1"><p className={'text-[10px] font-semibold '+primary}>Exact field comparison</p>{group.comparisons.slice(0,20).map((comparison) => <div key={comparison.path} className="flex flex-wrap items-start gap-2 border-t border-[var(--vyra-border-subtle)] py-1.5"><span className={'min-w-0 flex-1 break-all text-[10px] '+subtle}>{comparison.path}</span><span className={'text-[9px] font-semibold '+(comparison.same?'text-emerald-500':'text-amber-500')}>{comparison.same?'Exact value match':'Different / missing value'}</span></div>)}</div>}
                  <p className={'mt-2 text-[9px] '+muted}>A matching JSON value is not proof that the models agree semantically. Missing fields are counted as differences. Creator review remains separate.</p>
                </article>;
              })}</div>
            </section>}
            {visionKnowledgeConflicts.length > 0 && <section className="mt-4 rounded-lg border border-amber-500/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h4 className={'text-xs font-semibold '+primary}>Creator-approved knowledge conflicts</h4><p className={'mt-1 text-[10px] '+muted}>Different exact values were explicitly promoted by the creator for the same asset version, task and field. No value is automatically preferred or overwritten.</p></div>
                <span className="rounded bg-amber-500/10 px-2 py-1 text-[9px] font-semibold text-amber-500">{visionKnowledgeConflicts.length} conflict group(s)</span>
              </div>
              <div className="mt-3 space-y-3">{visionKnowledgeConflicts.slice(0,12).map((group) => {
                const version = versions.find((item) => item.id === group.versionId); const asset = assets.find((item) => item.id === group.assetId);
                return <article key={group.assetId+':'+group.versionId+':'+group.taskKind+':'+group.fieldPath} className="rounded-lg bg-[var(--vyra-bg-subtle)] p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2"><div><p className={'break-all text-xs font-semibold '+primary}>{asset?.name ?? 'Asset'} · {group.fieldPath}</p><p className={'mt-1 text-[10px] '+muted}>Version {version?.version_number ?? 'unknown'} · {group.taskKind.replaceAll('_',' ')} · {group.records.length} creator-approved records</p></div><span className="text-[9px] font-semibold text-amber-500">Exact-value disagreement</span></div>
                  <div className="mt-2 space-y-2">{group.records.map((record) => <div key={record.id} className="rounded-md border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-surface)] p-2">
                    <p className={'text-[10px] font-semibold '+primary}>{String(record.payload.model_provider_claim ?? 'Model unknown')} · {String(record.payload.model_id_claim ?? 'Model ID unknown')}</p>
                    <pre className={'mt-1 whitespace-pre-wrap break-words text-[10px] leading-4 '+subtle}>{JSON.stringify(record.payload.accepted_value, null, 2)}</pre>
                    {typeof record.payload.creator_note === 'string' && record.payload.creator_note && <p className={'mt-1 text-[9px] '+muted}>Creator note: {record.payload.creator_note}</p>}
                    <p className={'mt-1 text-[9px] '+muted}>{dateLabel(record.created_at)} · observation {String(record.payload.promotion_observation_id).slice(0,8)}</p>
                  </div>)}</div>
                  <p className={'mt-2 text-[9px] '+muted}>Both records remain immutable evidence. This comparison does not decide which value is correct, combine different contexts, or change DNA completion/reconstruction eligibility.</p>
                  {group.resolutionRecords.length > 0 && <div className="mt-3 rounded-md border border-[var(--vyra-border-subtle)] p-2">
                    <p className={'text-[10px] font-semibold '+primary}>Latest creator decision: {group.resolutionRecords[group.resolutionRecords.length - 1].payload.resolution_type === 'prefer_one' ? 'Scoped preference recorded' : 'Context-dependent values recorded'}</p>
                    <p className={'mt-1 text-[9px] '+muted}>This decision applies only to the exact promotion records listed in its history entry. New evidence does not inherit the decision automatically.</p>
                    <p className={'mt-2 text-[10px] font-semibold '+primary}>Creator resolution history</p>
                    {group.resolutionRecords.map((resolution) => <div key={resolution.id} className="mt-2">
                      <p className={'text-[10px] '+subtle}>{resolution.payload.resolution_type === 'prefer_one' ? 'Preferred value: ' + String(resolution.payload.preferred_promotion_record_id).slice(0,8) : 'Both values retained as context-dependent'} · {dateLabel(resolution.created_at)}</p>
                      {typeof resolution.payload.creator_context_label === 'string' && resolution.payload.creator_context_label && <div className="mt-1"><p className={'text-[9px] '+primary}>Creator-defined context: {resolution.payload.creator_context_label}</p>{Array.isArray(resolution.payload.creator_context_tags) && resolution.payload.creator_context_tags.length > 0 && <p className={'mt-1 break-words text-[9px] '+subtle}>Exact tags required: {resolution.payload.creator_context_tags.join(' · ')}</p>}<p className={'mt-1 text-[9px] '+muted}>Not applied: runtime context has not been independently supplied and exactly matched. Tags are creator-defined, not AI-inferred.</p></div>}
                      {typeof resolution.payload.creator_note === 'string' && resolution.payload.creator_note && <p className={'mt-1 text-[9px] '+muted}>{resolution.payload.creator_note}</p>}
                    </div>)}
                  </div>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={button} disabled={!!resolvingConflictKey} onClick={() => resolveVisionKnowledgeConflict(group, 'prefer_one')}>
                      {resolvingConflictKey === JSON.stringify([group.assetId, group.versionId, group.taskKind, group.fieldPath]) ? 'Saving…' : 'Prefer one value'}
                    </button>
                    <button type="button" className={button} disabled={!!resolvingConflictKey} onClick={() => resolveVisionKnowledgeConflict(group, 'keep_contextual')}>
                      Keep both as contextual
                    </button>
                  </div>
                </article>;
              })}</div>
              {visionKnowledgeConflicts.length > 12 && <p className={'mt-2 text-[9px] '+muted}>Showing 12 of {visionKnowledgeConflicts.length} conflict groups.</p>}
            </section>}
            {observations.length ? <div className="mt-3 space-y-2">{observations.slice(0,12).map((item)=><article key={item.id} className="rounded-lg border border-[var(--vyra-border-subtle)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className={'text-xs font-semibold '+primary}>{item.model_provider} · {item.model_id}</span><span className={'text-[10px] capitalize '+muted}>{item.verification_status.replaceAll('_',' ')}</span></div><p className={'mt-2 text-xs '+subtle}>{JSON.stringify(item.observation)}</p><p className={'mt-2 text-[10px] '+muted}>{item.task_kind.replaceAll('_',' ')} · {item.confidence === null ? 'confidence unavailable' : Math.round(Number(item.confidence)*100)+'% confidence'} · {dateLabel(item.created_at)}</p>{(() => { const review = dnaRecords.find((record) => record.source_kind === 'creator' && ['creator_confirmed', 'disputed'].includes(record.verification_status) && record.payload?.review_source === 'server_creator_review' && record.payload?.vision_observation_review_id === item.id); return review ? <div className="mt-2"><p className={'text-[10px] font-semibold '+(review.verification_status === 'creator_confirmed' ? 'text-emerald-500' : 'text-amber-500')}>Creator review: {review.verification_status.replaceAll('_',' ')} · applies to this observation only</p>{review.verification_status === 'creator_confirmed' && (() => { const promotedFields = dnaRecords.filter((record) => record.source_kind === 'creator' && record.payload?.promotion_source === 'creator_approved_vision_field' && record.payload?.promotion_observation_id === item.id); const availableFields = Object.keys(flattenObservation(item.observation)); return <div className="mt-2"><p className={'text-[10px] '+muted}>{promotedFields.length} field(s) promoted · {availableFields.length} available</p>{promotedFields.map((record)=><p key={record.id} className={'mt-1 break-all text-[10px] text-emerald-500'}>{String(record.payload?.promotion_field_path)} · creator-approved DNA field</p>)}<button type="button" disabled={promotingObservationId !== null || availableFields.length === 0} onClick={()=>void promoteVisionKnowledge(item.id)} className={button+' mt-2'}>{promotingObservationId===item.id?'Promoting…':'Promote one field to DNA'}</button></div>; })()}</div> : <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={reviewingObservationId !== null} onClick={()=>void reviewVisionObservation(item.id,'creator_confirmed')} className={button}>{reviewingObservationId===item.id?'Saving…':'Confirm observation'}</button><button type="button" disabled={reviewingObservationId !== null} onClick={()=>void reviewVisionObservation(item.id,'disputed')} className={button}>Dispute observation</button></div>; })()}</article>)}</div> : <div className="mt-3 rounded-lg border border-dashed border-[var(--vyra-border)] p-4 text-center"><Dna size={19} className={'mx-auto '+muted}/><p className={'mt-2 text-xs font-semibold '+primary}>No Vision observations yet</p><p className={'mt-1 text-[10px] '+muted}>The evidence registry is ready. AI Vision execution will be connected when the analysis provider workflow is implemented.</p></div>}
          </section>
          <section className={surface+' p-4'}>
            <h3 className={'text-sm font-semibold '+primary}>Reconstruction verification</h3>
            <p className={'mt-1 text-xs leading-5 '+subtle}>DNA-only blind reconstruction evidence. Visual similarity, geometry, exact pixels and upload provenance are reported separately; none is silently substituted for another.</p>
            {originV2LatestTests.length > 0 && <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className={'text-xs font-semibold '+primary}>Latest ORIGIN-01 V2 comparison by model</p>
                <span className={'text-[9px] '+muted}>Latest saved V2 run per provider</span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {originV2LatestTests.map((test) => {
                  const report = asRecord(test.report);
                  const comparison = asRecord(report.comparison);
                  const normalized = asRecord(comparison.normalizedImageComparison);
                  const geometry = asRecord(comparison.redRegionGeometry);
                  const pixel = asRecord(comparison.pixelComparison);
                  const upload = asRecord(report.candidateUploadReconciliation);
                  const normalizedScore = typeof normalized.normalizedGridRgbSimilarity === 'number' ? normalized.normalizedGridRgbSimilarity : null;
                  const geometryScore = typeof geometry.geometrySimilarity === 'number' ? geometry.geometrySimilarity : null;
                  const backgroundDelta = typeof comparison.backgroundCornerColorEuclideanDelta === 'number' ? comparison.backgroundCornerColorEuclideanDelta : null;
                  const uploadStatus = typeof upload.status === 'string' ? upload.status : 'not recorded';
                  const normalizedReason = typeof normalized.reason === 'string' ? normalized.reason : '';
                  return <article key={test.id} className="min-w-0 rounded-lg border border-[var(--vyra-border-subtle)] bg-[var(--vyra-bg-subtle)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className={'text-xs font-semibold '+primary}>{test.model_provider}</p><p className={'mt-0.5 text-[9px] '+muted}>{test.model_id} · {dateLabel(test.created_at)}</p></div>
                      <span className={'shrink-0 rounded px-2 py-1 text-[9px] font-semibold '+(test.test_status === 'passed' && test.exact_match === true ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500')}>{test.test_status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-[var(--vyra-border-subtle)] p-2"><p className={'text-[9px] '+muted}>Normalized image</p><p className={'mt-0.5 text-base font-semibold '+primary}>{normalizedScore === null ? 'N/A' : (normalizedScore*100).toFixed(2)+'%'}</p><p className={'text-[9px] '+muted}>{normalized.performed === true ? '256-grid RGB' : 'Not evaluated'}</p></div>
                      <div className="rounded-md border border-[var(--vyra-border-subtle)] p-2"><p className={'text-[9px] '+muted}>Geometry</p><p className={'mt-0.5 text-base font-semibold '+primary}>{geometryScore === null ? 'N/A' : (geometryScore*100).toFixed(2)+'%'}</p><p className={'text-[9px] '+muted}>Red-region only</p></div>
                      <div className="rounded-md border border-[var(--vyra-border-subtle)] p-2"><p className={'text-[9px] '+muted}>Background delta</p><p className={'mt-0.5 text-sm font-semibold '+primary}>{backgroundDelta === null ? 'N/A' : backgroundDelta.toFixed(2)}</p><p className={'text-[9px] '+muted}>Lower is closer</p></div>
                      <div className="rounded-md border border-[var(--vyra-border-subtle)] p-2"><p className={'text-[9px] '+muted}>Exact pixels</p><p className={'mt-0.5 text-sm font-semibold '+primary}>{pixel.performed === true ? (test.exact_match ? 'Matched' : 'Different') : 'Not evaluated'}</p><p className={'text-[9px] '+muted}>{pixel.performed === true ? 'Decoded RGB' : 'Dimensions differ / unavailable'}</p></div>
                    </div>
                    <div className="mt-2 border-t border-[var(--vyra-border-subtle)] pt-2">
                      <p className={'text-[9px] '+muted}>Upload provenance</p>
                      <p className={'mt-0.5 break-words text-[10px] font-semibold '+(uploadStatus === 'reconciled' ? 'text-emerald-500' : 'text-amber-500')}>{uploadStatus.replaceAll('_',' ')}</p>
                      {normalizedScore === null && normalizedReason && <p className={'mt-1 text-[9px] '+muted}>{normalizedReason}</p>}
                      <p className={'mt-1 text-[9px] '+muted}>A high similarity score is not an exact reconstruction pass.</p>
                    </div>
                  </article>;
                })}
              </div>
            </div>}
            <div className="mt-4">
              <p className={'mb-2 text-xs font-semibold '+primary}>Test history</p>
              <div className="space-y-2">{reconstructionTests.length ? reconstructionTests.map((test)=><div key={test.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--vyra-bg-subtle)] p-3"><div><p className={'text-xs font-semibold '+primary}>{test.model_provider} · {test.model_id}</p><p className={'mt-1 text-[10px] '+muted}>{test.protocol_version ?? 'Legacy protocol'} · {test.comparison_mode.replaceAll('_',' ')} · {dateLabel(test.created_at)}</p></div><span className={'text-[10px] font-semibold '+(test.test_status==='passed'&&test.exact_match?'text-emerald-500':subtle)}>{test.test_status}{test.exact_match===true?' · Exact match':test.exact_match===false?' · Not exact':''}</span></div>):<div className="rounded-lg border border-dashed border-[var(--vyra-border)] p-4 text-center"><FlaskConical size={20} className={'mx-auto '+muted}/><p className={'mt-2 text-xs font-semibold '+primary}>No reconstruction tests yet</p><p className={'mt-1 text-[10px] '+muted}>No independent reconstruction comparisons have been saved yet.</p></div>}</div>
            </div>
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

      {previewAsset && <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-4" onMouseDown={(event)=>{if(event.target===event.currentTarget){setPreviewAsset(null);setPreviewUrl('');}}}><section role="dialog" aria-modal="true" aria-label={previewAsset.name} className="max-h-[90svh] w-full max-w-3xl overflow-auto rounded-2xl border border-[var(--vyra-border)] bg-[var(--vyra-bg-surface)] p-4 shadow-2xl"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className={'truncate text-sm font-semibold '+primary}>{previewAsset.name}</h3><p className={'mt-1 text-[10px] '+muted}>{previewAsset.mime_type} · {prettyBytes(Number(previewAsset.size_bytes))}</p></div><button type="button" onClick={()=>{setPreviewAsset(null);setPreviewUrl('');}} aria-label="Close preview" className={button}><X size={15}/></button></div><div className="mt-4 flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-[var(--vyra-bg-subtle)] p-2">{!previewUrl?<span className={'text-xs '+muted}>Preparing secure preview…</span>:previewAsset.asset_type==='image'?<img src={previewUrl} alt={previewAsset.name} className="max-h-[65svh] max-w-full object-contain"/>:previewAsset.asset_type==='video'?<video src={previewUrl} controls className="max-h-[65svh] max-w-full"/>:previewAsset.asset_type==='audio'?<audio src={previewUrl} controls className="w-full"/>:<div className="p-8 text-center"><FileText size={32} className={'mx-auto '+muted}/><p className={'mt-3 text-xs '+subtle}>Preview is not available for this file type.</p><a href={previewUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--vyra-accent-primary)]"><Download size={13}/> Open or download file</a></div>}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className={'break-all font-mono text-[10px] '+muted}>SHA-256 · {previewAsset.sha256 ?? 'Not calculated'}</span><span className={'text-[10px] '+muted}>Version {versions.filter((item)=>item.asset_id===previewAsset.id).length || 1}</span></div></section></div>}
    </div>
  );
};
