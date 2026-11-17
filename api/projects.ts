import { createVercelCustomerProjectsHandler } from '../src/server/vercelCustomerProjectsHandler.js';

// Expose GET /api/projects directly. Vercel does not consistently map a
// nested index.ts function to the directory root across deployments.
export default createVercelCustomerProjectsHandler();
