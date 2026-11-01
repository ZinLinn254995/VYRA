import 'dotenv/config';

import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer } from 'node:http';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { createTikTokRouter } from './src/server/tiktok.js';
import { createAiRouter } from './src/server/ai.js';
import { createPricingRouter } from './src/server/pricing.js';
import { createSupabaseAuthRouter } from './src/server/supabaseAuth.js';
import { createCustomerProjectsRouter } from './src/server/customerProjects.js';

const app = express();
const httpServer = createHttpServer(app);
const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'dist');

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use('/api/tiktok', createTikTokRouter());
app.use('/api/auth', createSupabaseAuthRouter());
app.use('/api', createCustomerProjectsRouter());

app.use('/api', createPricingRouter());
app.use('/api', createAiRouter());

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large. Reduce reference media size or shorten the request.' });
  }
  console.error('[server] Request handling failed.');
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(DIST_DIR));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      configFile: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'vite.config.ts'),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.info('[server] VYRA listening on port ' + PORT);
  });
}

startServer().catch((error: unknown) => {
  console.error('[server] Failed to start VYRA server.');
  if (error instanceof Error) console.error(error.message);
  process.exitCode = 1;
});
