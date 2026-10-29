import express from 'express';
import { createTikTokRouter } from '../../src/server/tiktok.js';

// Vercel deploys files under /api as serverless functions. The Express dev
// server in server.ts is not the production API entry point for this Vite app.
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/', createTikTokRouter());
// Also support runtimes that preserve the full request pathname.
app.use('/api/tiktok', createTikTokRouter());

export default app;
