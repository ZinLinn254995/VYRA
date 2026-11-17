import express from 'express';
import { createCustomerProjectsRouter } from './customerProjects.js';

// Vercel's explicit file routes are deployed as independent functions.
// Accept both the original /api/... URL and a runtime-stripped path so the
// Express router works regardless of the function URL normalization.
export function createVercelCustomerProjectsHandler() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  const router = createCustomerProjectsRouter();
  app.use('/api', router);
  app.use('/', router);
  app.use((_req, res) => res.status(404).json({ error: 'VYRA API route not found.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request is too large. Please shorten the request.' });
    }
    return res.status(500).json({ error: 'An unexpected server error occurred.' });
  });
  return app;
}
