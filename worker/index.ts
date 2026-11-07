import { httpServerHandler } from 'cloudflare:node';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createTikTokRouter } from '../src/server/tiktok.js';
import { createAiRouter } from '../src/server/ai.js';
import { createPricingRouter } from '../src/server/pricing.js';
import { createSupabaseAuthRouter } from '../src/server/supabaseAuth.js';
import { createCustomerProjectsRouter } from '../src/server/customerProjects.js';
import { createCreditTransfersRouter } from '../src/server/creditTransfers.js';

// Node.js compatibility populates process.env from Worker vars and secrets.
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ status: 'ok', runtime: 'cloudflare-workers' });
});

app.use('/api/tiktok', createTikTokRouter());
app.use('/api/auth', createSupabaseAuthRouter());
app.use('/api', createCustomerProjectsRouter());
app.use('/api', createCreditTransfersRouter());
app.use('/api', createPricingRouter());
app.use('/api', createAiRouter());

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large. Reduce reference media size or shorten the request.' });
  }
  console.error('[worker] Request handling failed.');
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// Cloudflare's Node HTTP bridge hosts the existing Express routers without
// changing the local Node/Vite development server in server.ts.
app.listen(3000);
export default httpServerHandler({ port: 3000 });
