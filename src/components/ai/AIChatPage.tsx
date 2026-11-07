import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp, Archive, Clock3, Copy, History, Lock, MessageSquare,
  MoreHorizontal, Plus, Share2, Trash2, Unlock, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { getCurrentAccessToken } from '../../context/AuthContext';
import { aiService } from '../../services/aiService';
import { encodeVyralDnaV3PngFromPackage, parseVyralManifest, readVyralZip, reconstructVyralDnaV3FromPackage, reconstructVyralFileDnaFromPackage } from '../../services/vyralPackage.ts';
import { analyzeVyralFileStructureV1, validateVyralFileDnaV1Record } from '../../services/vyralFileDnaV1.ts';
import { validateVyralMasterDnaV1 } from '../../services/vyralMasterDnaV1.ts';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; status?: 'success' | 'preview' | 'error'; providerLabel?: string };
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
    `Assets in package: ${manifest.assets.length} · DNA records with payloads: ${manifest.dnaRecords.length}`,
    `Asset inventory (showing up to 64 of ${manifest.assets.length}): ${manifest.assets.slice(0, 64).map((item) => `${String(item.name ?? item.id)} [${String(item.asset_type ?? 'unknown type')}; ${String(item.mime_type ?? 'unknown MIME')}]`).join('; ')}`,
    masterDna ? `Master DNA verified: revision ${masterDna.snapshot.revision} · ${masterDna.assets.length} total Vyral assets · fingerprint ${masterDna.integrity.vyral_fingerprint}` : 'No portable Master DNA snapshot is included.',
    ...(masterDna ? (() => { const assetName = (id: string) => String(manifest.assets.find((item) => item.id === id)?.name ?? id); const endpointName = (endpoint: { kind: 'asset' | 'vyral'; asset_id?: string; vyral_id?: string }) => endpoint.kind === 'asset' ? assetName(String(endpoint.asset_id)) : String(manifest.vyral.name); return [`Vyral purpose: ${masterDna.purpose.summary}`, `Intended uses: ${masterDna.purpose.intended_uses.join(', ')}`, `Asset inventory (showing up to 64 of ${masterDna.assets.length}): ${masterDna.assets.slice(0, 64).map((item) => `${assetName(item.asset_id)} [${item.role}; ${item.media_type}; purpose: ${item.purpose}; reconstruction: ${item.reconstruction_claim}; DNA ref: ${item.dna_ref.record_id}]`).join('; ')}`, `Asset relationships (showing up to 128 of ${masterDna.relationships.length}): ${masterDna.relationships.slice(0, 128).map((item) => `${endpointName(item.from)} --${item.type}--> ${endpointName(item.to)} (reason: ${item.rationale})`).join('; ')}`, `Cross-asset constraints: ${(masterDna.reconstruction_profile.cross_asset_constraints ?? []).map((item) => item.description).join('; ') || 'None declared'}`, `Reconstruction notes: ${masterDna.reconstruction_profile.notes.join('; ')}`, `Overall reconstruction claim: ${masterDna.reconstruction_profile.overall_claim}`, `Visual access boundary: ${visionImages.length} of ${v3Records.length} raster DNA v3 asset previews are attached to this Vision request (maximum four); File DNA binaries are integrity-checked but their audio/video/document contents are not decoded or attached to Vision.`]; })() : []),
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
  return { context: lines.join('\n'), visionImages };
};

export const AIChatPage: React.FC<AIChatPageProps> = ({ isAuthenticated, onLoginRequired }) => {
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
  const [selectedVyralImages, setSelectedVyralImages] = useState<(VyralVisionImage & { assetId: string; assetName: string })[]>([]);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const saveCurrentSession = (archived = false) => {
    if (!hasMessages) return;
    const session: ChatSession = {
      id: activeSessionId ?? makeId(),
      title: currentTitle,
      updatedAt: 'Just now',
      messages,
      archived,
      locked: isLocked,
    };
    setSessions((previous) => [session, ...previous.filter((item) => item.id !== session.id)]);
  };

  const startNewChat = () => {
    saveCurrentSession();
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralImages([]);
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
    setSelectedVyralImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDraft('');
    setHistoryOpen(false);
  };

  const sendMessage = async (value = draft) => {
    const text = value.trim();
    if ((!text && !selectedFile) || isLocked || isSending) return;
    if (selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    const visionImages = selectedVyralImages;
    const attachmentText = selectedFile
      ? `\n\nAttached file: ${selectedFile.name} (${selectedFile.type || 'application/octet-stream'}, ${selectedFile.size.toLocaleString()} bytes)${selectedVyralContext ? `\n\n${selectedVyralContext}` : selectedFileStatus ? `\n${selectedFileStatus}` : ''}`
      : '';
    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: (text || 'Please inspect this attachment.') + attachmentText,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setDraft('');
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!activeSessionId) setActiveSessionId(makeId());

    setIsSending(true);
    try {
      const accessToken = await getCurrentAccessToken();
      const result = await aiService.generateResponse({
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        ...(accessToken ? { accessToken } : {}),
        idempotencyKey: 'chat-' + makeId(),
        ...(visionImages.length ? { visionImages: visionImages.map(({ mimeType, data, assetId, assetName }) => ({ mimeType, data, assetId, assetName })) } : {}),
      });
      setMessages((previous) => [...previous, {
        id: makeId(),
        role: 'assistant',
        content: result.content,
        status: result.status,
        providerLabel: [result.providerName, result.modelName].filter(Boolean).join(' · '),
      }]);
    } catch (error) {
      setMessages((previous) => [...previous, {
        id: makeId(),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'VYRA AI could not complete this request. Please try again.',
        status: 'error',
      }]);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelection = async (file: File | null) => {
    setSelectedFile(file);
    setSelectedVyralContext(null);
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

  const archiveCurrentChat = () => {
    saveCurrentSession(true);
    setMessages([]);
    setDraft('');
    setActiveSessionId(null);
    setIsLocked(false);
    setSelectedFile(null);
    setSelectedFileStatus(null);
    setSelectedVyralContext(null);
    setSelectedVyralImages([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActionsOpen(false);
  };

  const deleteCurrentChat = () => {
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
          {selectedFile && (
            <div className="mb-1 flex items-center gap-2 px-2 text-[10px] text-[var(--vyra-text-muted)]">
              <span className="min-w-0 flex-1 truncate">{selectedFile.name}{selectedFileStatus ? ` · ${selectedFileStatus}` : ''}</span>
              <button type="button" onClick={() => { setSelectedFile(null); setSelectedFileStatus(null); setSelectedVyralContext(null); setSelectedVyralImages([]); if (fileInputRef.current) fileInputRef.current.value = ''; }} aria-label="Remove attachment" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-[var(--vyra-bg-hover)]">
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
              disabled={(!draft.trim() && !selectedFile) || isLocked || isSending || Boolean(selectedFile?.name.toLowerCase().endsWith('.vyral') && !selectedVyralContext)}
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
                <p className="mt-0.5 text-[10px] text-[var(--vyra-text-muted)]">Your conversations</p>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close chat history" className="grid size-8 place-items-center rounded-lg text-[var(--vyra-text-muted)] hover:bg-[var(--vyra-bg-hover)]"><X size={17} /></button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-2">
              {sessions.filter((session) => !session.archived).length ? sessions.filter((session) => !session.archived).map((session) => (
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
