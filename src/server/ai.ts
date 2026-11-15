import express, { type Request, type Response } from 'express';
import { verifySupabaseAccessToken } from './supabaseAuth.js';

const router = express.Router();
async function requireVerifiedVYraSession(req: Request, res: Response): Promise<string | null> {
  const authorization = req.header('authorization') ?? '';
  const tokenMatch = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!tokenMatch) {
    res.status(401).json({ error: 'Sign in to use VYRA AI features.' });
    return null;
  }
  const auth = await verifySupabaseAccessToken(tokenMatch[1]);
  if (!auth.ok) {
    if (auth.reason === 'not_configured' || auth.reason === 'provider_unavailable') {
      res.status(503).json({ error: 'VYRA authentication is temporarily unavailable.' });
    } else {
      res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
    }
    return null;
  }
  res.setHeader('Cache-Control', 'no-store');
  return auth.user.id;
}

async function callRunwayMediaQuoteFunction(accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('Media quote service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/quote-runway-media', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(40000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

router.post('/media/quote', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callRunwayMediaQuoteFunction(match[1], req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch {
    return res.status(503).json({ error: 'Media quote service is temporarily unavailable.' });
  }
});

async function callMediaCreditPricingFunction(accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('Media pricing service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/manage-media-credit-pricing', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

router.post('/admin/media-credit-pricing', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callMediaCreditPricingFunction(match[1], req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch { return res.status(503).json({ error: 'Media credit pricing administration is temporarily unavailable.' }); }
});

async function callRunwayMediaApprovalFunction(functionName: string, accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('Media approval service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/' + functionName, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

router.post('/media/quote/approve-credits', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callRunwayMediaApprovalFunction('approve-runway-media-credit', match[1], req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch { return res.status(503).json({ error: 'Media credit approval is temporarily unavailable.' }); }
});

router.post('/media/jobs', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callRunwayMediaApprovalFunction('create-runway-media-job', match[1], req.body ?? {});
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch { return res.status(503).json({ error: 'Media job service is temporarily unavailable.' }); }
});


async function callOpenAIChatFunction(accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('OpenAI chat service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/vyra-openai-chat', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: payload.stream === true ? 'text/event-stream' : 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(65000),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({})) as Record<string, unknown>
    : {};
  return { response, data };
}

async function callOpenAIKeyManagementFunction(accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('API key settings service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/manage-openai-api-key', {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

router.get('/providers/openai/settings', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callOpenAIKeyManagementFunction(match[1], { action: 'status' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch { return res.status(503).json({ error: 'OpenAI API key settings are temporarily unavailable.' }); }
});

router.post('/providers/openai/settings', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) return res.status(400).json({ error: 'Enter a valid-looking OpenAI API key.' });
  try {
    const { response, data } = await callOpenAIKeyManagementFunction(match[1], { action: 'save', apiKey });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch { return res.status(503).json({ error: 'OpenAI API key settings are temporarily unavailable.' }); }
});

// Basic per-process abuse guard for the paid API endpoint. For a multi-instance
// production deployment, replace this with a shared store-backed limiter.
const chatRequestWindows = new Map<string, { count: number; resetAt: number }>();
const CHAT_WINDOW_MS = 60_000;
const CHAT_MAX_REQUESTS = 20;

router.use('/ai/chat', (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'POST') return next();

  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let window = chatRequestWindows.get(key);

  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + CHAT_WINDOW_MS };
    chatRequestWindows.set(key, window);
  }

  window.count += 1;
  if (window.count > CHAT_MAX_REQUESTS) {
    res.setHeader('Retry-After', String(Math.ceil((window.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many AI requests. Please wait a moment and try again.' });
  }

  // Keep this simple in-memory guard bounded when many distinct IPs hit the service.
  if (chatRequestWindows.size > 5000) {
    for (const [entryKey, entry] of chatRequestWindows) {
      if (entry.resetAt <= now) chatRequestWindows.delete(entryKey);
    }
  }

  return next();
});

router.post('/ai/chat', async (req: Request, res: Response) => {
  const body = req.body as {
    ping?: boolean;
    stream?: boolean;
    task?: string;
    detailsScope?: string;
    messages?: Array<{ role?: string; content?: string }>;
    conversationId?: string;
    activeVyralId?: string;
    uploadAttachment?: { clientDraftId?: string; fileName?: string; mimeType?: string; sizeBytes?: number };
    workspaceContext?: Record<string, unknown>;
    visionImages?: unknown[];
    mediaFiles?: unknown[];
  };

  if (body?.ping === true) {
    const bearer = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
    if (!bearer) return res.status(401).json({ status: 'error', error: 'Sign in to check the VYRA AI connection.' });
    try {
      const { response, data } = await callOpenAIChatFunction(bearer[1], { healthCheck: true });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(response.status).json(data);
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        status: 'error',
        provider: 'openai',
        modelName: 'gpt-4.1-mini',
        message: 'VYRA could not check the platform-managed OpenAI connection.',
      });
    }
  }

  if (!await requireVerifiedVYraSession(req, res)) return;

  if (body.task === 'suggest_details' && !['asset', 'vyral', 'storyboard'].includes(body.detailsScope ?? 'asset')) {
    return res.status(400).json({ error: 'Choose a supported metadata scope.' });
  }
  if (body.task) {
    return res.status(501).json({
      error: 'This AI task is not connected to the OpenAI chat path yet. General AI Chat remains available.',
      code: 'AI_TASK_NOT_ENABLED',
      provider: 'openai',
    });
  }
  if (body.visionImages !== undefined || body.mediaFiles !== undefined) {
    return res.status(501).json({
      error: 'OpenAI text chat is available. Image, document and audio inspection will be enabled after the OpenAI multimodal path is connected.',
      code: 'OPENAI_MULTIMODAL_NOT_ENABLED',
      provider: 'openai',
    });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .slice(-20)
    .map((item) => ({ role: item.role as 'user' | 'assistant', content: String(item.content).trim().slice(0, 12000) }))
    .filter((item) => item.content.length > 0);
  if (!messages.some((item) => item.role === 'user')) {
    return res.status(400).json({ error: 'Send at least one non-empty user message.' });
  }
  const totalChars = messages.reduce((sum, item) => sum + item.content.length, 0);
  if (totalChars > 30000) return res.status(413).json({ error: 'Chat history is too long. Start a new conversation.' });

  const bearer = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!bearer) return res.status(401).json({ error: 'Sign in to use VYRA AI Chat.' });
  const conversationId = typeof body.conversationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.conversationId) ? body.conversationId : undefined;
  const activeVyralId = typeof body.activeVyralId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.activeVyralId) ? body.activeVyralId : undefined;
  const workspaceContext = body.workspaceContext && typeof body.workspaceContext === 'object' && !Array.isArray(body.workspaceContext) ? body.workspaceContext : undefined;
  const uploadAttachment = body.uploadAttachment && typeof body.uploadAttachment === 'object' && !Array.isArray(body.uploadAttachment) ? body.uploadAttachment : undefined;

  try {
    const wantsStream = body.stream === true;
    const { response, data } = await callOpenAIChatFunction(bearer[1], {
      messages,
      ...(conversationId ? { conversationId } : {}),
      ...(activeVyralId ? { activeVyralId } : {}),
      ...(uploadAttachment ? { uploadAttachment } : {}),
      ...(workspaceContext ? { workspaceContext } : {}),
      ...(wantsStream ? { stream: true } : {}),
    });
    if (wantsStream && response.ok && response.body && (response.headers.get('content-type') ?? '').includes('text/event-stream')) {
      res.status(response.status);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      const operatorActionHeader = response.headers.get('X-Vyra-Operator-Action');
      if (operatorActionHeader) res.setHeader('X-Vyra-Operator-Action', operatorActionHeader);
      res.flushHeaders?.();
      const reader = response.body.getReader();
      const cancelOnClose = () => { if (!res.writableEnded) void reader.cancel().catch(() => undefined); };
      res.once('close', cancelOnClose);
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.write(decoder.decode(value, { stream: true }))) {
            await new Promise<void>((resolve) => res.once('drain', resolve));
          }
        }
        const tail = decoder.decode();
        if (tail) res.write(tail);
        if (!res.writableEnded) res.end();
      } catch {
        if (!res.writableEnded) res.end();
      } finally {
        res.off('close', cancelOnClose);
        reader.releaseLock();
      }
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch {
    return res.status(503).json({ error: 'VYRA AI Chat is temporarily unavailable. Please retry.' });
  }
});

async function callRunwayManagementFunction(accessToken: string, payload: Record<string, unknown>) {
  const baseUrl = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!baseUrl || !anonKey) throw new Error('Runway provider settings service is not configured.');
  const response = await fetch(baseUrl + '/functions/v1/manage-runway-provider', {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

// Runway credential management is admin-only in the Edge Function. This
// authenticated server proxy never reads or returns the stored credential.
router.get('/providers/runway/settings', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  try {
    const { response, data } = await callRunwayManagementFunction(match[1], { action: 'status' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch {
    return res.status(503).json({ error: 'Runway provider settings are temporarily unavailable.' });
  }
});

router.post('/providers/runway/settings', async (req: Request, res: Response) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Sign in to VYRA.' });
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  if (apiKey.length < 20 || apiKey.length > 512 || /\s/.test(apiKey)) {
    return res.status(400).json({ error: 'Enter a valid-looking Runway API key.' });
  }
  try {
    const { response, data } = await callRunwayManagementFunction(match[1], { action: 'save', apiKey });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch {
    return res.status(503).json({ error: 'Runway provider settings are temporarily unavailable.' });
  }
});

export function createAiRouter() {
  return router;
}
