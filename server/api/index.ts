import express from 'express';
import { Router } from 'express';
import * as scheduleManagement from './schedule-management';
import { registerPeopleManagementAPI } from './people-management';

const apiRouter = Router();

// Let the individual modules register their routes
// The people management module registers its own routes
// Schedule management still needs to be converted to use the same pattern

// This is a temporary shim until we convert schedule-management.ts to use the same registration pattern
const app = express();
registerPeopleManagementAPI(app);

// Forward all relevant middleware and routes from the temporary express app to the router
app._router.stack.forEach((middleware: any) => {
  if (middleware.route) {
    const route = middleware.route;
    const method = Object.keys(route.methods)[0];
    
    // Explicitly handle each HTTP method with proper type safety
    if (method === 'get') {
      apiRouter.get(route.path.replace('/api', ''), ...route.stack.map((layer: any) => layer.handle));
    } else if (method === 'post') {
      apiRouter.post(route.path.replace('/api', ''), ...route.stack.map((layer: any) => layer.handle));
    } else if (method === 'put') {
      apiRouter.put(route.path.replace('/api', ''), ...route.stack.map((layer: any) => layer.handle));
    } else if (method === 'delete') {
      apiRouter.delete(route.path.replace('/api', ''), ...route.stack.map((layer: any) => layer.handle));
    }
  }
});

// Export the router
export { apiRouter };