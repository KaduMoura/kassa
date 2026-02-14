import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';

export async function adminRoutes(server: FastifyInstance) {
    const controller = new AdminController();

    // Secure all admin routes
    server.addHook('preHandler', adminAuthMiddleware);

    server.get('/config', (req, res) => controller.getConfig(req, res));
    server.patch('/config', (req, res) => controller.updateConfig(req, res));
    server.put('/config', (req, res) => controller.updateConfig(req, res));
    server.post('/config/reset', (req, res) => controller.resetConfig(req, res));
    server.get('/telemetry', (req, res) => controller.getTelemetry(req, res));
    server.get('/telemetry/export', (req, res) => controller.exportTelemetry(req, res));
}
