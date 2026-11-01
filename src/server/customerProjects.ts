import express, { type Request, type Response } from 'express';
import { verifySupabaseAccessToken, type SupabaseUser } from './supabaseAuth.js';

type ProjectsRouterOptions = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  fetcher?: typeof fetch;
  verifyToken?: typeof verifySupabaseAccessToken;
};

type PortableProject = {
  localId: string;
  title: string;
  status: 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'ready_to_publish' | 'archived';
  projectData: Record<string, unknown>;
};

const PROJECT_STATUSES = new Set<PortableProject['status']>([
  'draft', 'in_review', 'changes_requested', 'approved', 'ready_to_publish', 'archived',
]);
const PRIVATE_FIELD = /(api.?key|access.?token|refresh.?token|secret|password|authorization|generated(image|audio|video)id|finalvideoid)/i;
const MAX_PROJECTS_PER_REQUEST = 100;
const MAX_PROJECT_BYTES = 500_000;

export function sanitizePortableProjectData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let nodes = 0;

  const clean = (input: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 20_000 || depth > 12) throw new Error('Project data is too complex.');
    if (input === null || typeof input === 'boolean' || typeof input === 'number') return input;
    if (typeof input === 'string') {
      if (/^(data:|blob:)/i.test(input.trim())) return undefined;
      if (input.length > 100_000) throw new Error('A project field is too large.');
      return input;
    }
    if (Array.isArray(input)) {
      return input.slice(0, 5_000).map((item) => clean(item, depth + 1)).filter((item) => item !== undefined);
    }
    if (typeof input === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
        if (PRIVATE_FIELD.test(key) || /^(mediaUrl|finalVideoUrl|localFilePath)$/i.test(key)) continue;
        const safeValue = clean(child, depth + 1);
        if (safeValue !== undefined) output[key] = safeValue;
      }
      return output;
    }
    return undefined;
  };

  try {
    const result = clean(value, 0);
    if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
    if (JSON.stringify(result).length > MAX_PROJECT_BYTES) return null;
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseProject(input: unknown): PortableProject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const item = input as Record<string, unknown>;
  const localId = typeof item.localId === 'string' ? item.localId.trim() : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const status = typeof item.status === 'string' && PROJECT_STATUSES.has(item.status as PortableProject['status'])
    ? item.status as PortableProject['status']
    : 'draft';
  const projectData = sanitizePortableProjectData(item.projectData);
  if (!localId || localId.length > 128 || !title || title.length > 200 || !projectData) return null;
  return { localId, title, status, projectData };
}

async function verifyRequestUser(
  req: Request,
  options: ProjectsRouterOptions,
): Promise<{ user: SupabaseUser } | { error: string; status: number }> {
  const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
  if (!match) return { error: 'A Supabase access token is required.', status: 401 };
  const result = await (options.verifyToken ?? verifySupabaseAccessToken)(match[1], {
    supabaseUrl: options.supabaseUrl,
    supabaseAnonKey: options.supabaseAnonKey,
    fetcher: options.fetcher,
  });
  if (!result.ok) {
    if (result.reason === 'not_configured') return { error: 'Cloud projects are not configured.', status: 503 };
    if (result.reason === 'provider_unavailable') return { error: 'Authentication provider is temporarily unavailable.', status: 503 };
    return { error: 'The session is invalid or expired.', status: 401 };
  }
  return { user: result.user };
}

export function createCustomerProjectsRouter(options: ProjectsRouterOptions = {}) {
  const router = express.Router();
  const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const anonKey = (options.supabaseAnonKey ?? process.env.SUPABASE_ANON_KEY ?? '').trim();
  const fetcher = options.fetcher ?? fetch;

  router.get('/projects', async (req: Request, res: Response) => {
    const identity = await verifyRequestUser(req, options);
    if ('error' in identity) return res.status(identity.status).json({ error: identity.error });
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Cloud projects are not configured.' });

    try {
      const endpoint = new URL('/rest/v1/projects', supabaseUrl);
      endpoint.searchParams.set('select', 'id,local_id,title,status,project_data,created_at,updated_at');
      endpoint.searchParams.set('order', 'updated_at.desc');
      const response = await fetcher(endpoint, {
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + (req.header('authorization') ?? '').replace(/^Bearer\s+/i, ''),
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
      if (!response.ok) return res.status(response.status === 401 || response.status === 403 ? 401 : 503)
        .json({ error: 'Could not load cloud projects.' });
      const projects: unknown = await response.json();
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ projects });
    } catch {
      return res.status(503).json({ error: 'Cloud project storage is temporarily unavailable.' });
    }
  });

  router.post('/projects/import', async (req: Request, res: Response) => {
    const identity = await verifyRequestUser(req, options);
    if ('error' in identity) return res.status(identity.status).json({ error: identity.error });
    if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Cloud projects are not configured.' });

    const body = req.body as { projects?: unknown };
    if (!body || !Array.isArray(body.projects) || body.projects.length < 1 || body.projects.length > MAX_PROJECTS_PER_REQUEST) {
      return res.status(400).json({ error: 'Provide between 1 and 100 projects per import.' });
    }
    const projects = body.projects.map(parseProject);
    if (projects.some((project) => project === null)) {
      return res.status(400).json({ error: 'One or more projects are invalid or contain non-portable data.' });
    }

    const rows = (projects as PortableProject[]).map((project) => ({
      user_id: identity.user.id,
      local_id: project.localId,
      title: project.title,
      status: project.status,
      project_data: project.projectData,
    }));

    try {
      const endpoint = new URL('/rest/v1/projects', supabaseUrl);
      endpoint.searchParams.set('on_conflict', 'user_id,local_id');
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: 'Bearer ' + (req.header('authorization') ?? '').replace(/^Bearer\s+/i, ''),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
        cache: 'no-store',
      });
      if (!response.ok) {
        const providerBody = await response.text().catch(() => '');
        let providerError: { message?: string; code?: string; details?: string; hint?: string } = {};
        try { providerError = JSON.parse(providerBody) as typeof providerError; } catch { /* keep provider response generic */ }
        const safeCode = typeof providerError.code === 'string' ? providerError.code.slice(0, 32) : undefined;
        const safeMessage = typeof providerError.message === 'string' ? providerError.message.slice(0, 240) : undefined;
        console.error('[cloud-projects] Supabase import rejected', {
          status: response.status,
          code: safeCode,
          message: safeMessage,
          details: typeof providerError.details === 'string' ? providerError.details.slice(0, 240) : undefined,
        });
        const status = response.status === 401 || response.status === 403 ? response.status
          : response.status >= 400 && response.status < 500 ? 400 : 503;
        const diagnostic = safeCode ? ` (${safeCode})` : '';
        return res.status(status).json({
          error: `Cloud backup was rejected by storage\${diagnostic}: ${safeMessage || 'Supabase returned an error'}. Your local projects have not been changed.`,
        });
      }
      const saved: unknown = await response.json();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ imported: Array.isArray(saved) ? saved.length : rows.length, projects: saved });
    } catch (cause) {
      console.error('[cloud-projects] Import request failed before a storage response', cause);
      return res.status(503).json({ error: 'Cloud project storage is temporarily unavailable. Your local projects have not been changed.' });
    }
  });

  return router;
}
