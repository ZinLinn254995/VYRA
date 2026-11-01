import express, { type Request, type Response, type NextFunction } from 'express';
import { createAiRouter } from '../src/server/ai.js';
import { createPricingRouter } from '../src/server/pricing.js';
import { createSupabaseAuthRouter } from '../src/server/supabaseAuth.js';
import { createCustomerProjectsRouter } from '../src/server/customerProjects.js';

// Vercel deploys this catch-all as a serverless function. The local Express
// development server is not available in the Vercel runtime.
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const aiRouter = createAiRouter();
const pricingRouter = createPricingRouter();
const authRouter = createSupabaseAuthRouter();
const customerProjectsRouter = createCustomerProjectsRouter();
// Vercel may strip the /api prefix, leaving /auth/session for this catch-all.
// Mount both stripped and unstripped paths so auth verification works either way.
app.use('/', pricingRouter);
app.use('/', aiRouter);
app.use('/auth', authRouter);
app.use('/', authRouter);
app.use('/', customerProjectsRouter);
app.use('/api', pricingRouter);
app.use('/api', aiRouter);
app.use('/api/auth', authRouter);
app.use('/api', customerProjectsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'VYRA API route not found.' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large. Please shorten the request.' });
  }
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

export default app;
