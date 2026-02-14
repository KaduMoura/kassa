import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';

export async function adminRoutes(server: FastifyInstance) {
    const controller = new AdminController();

    // Basic admin middleware (placeholder for real auth)
    server.addHook('preHandler', async (request, reply) => {
        const isAdmin = request.headers['x-admin-key'] === 'debug-secret'; // Super simple check for now
        if (!isAdmin && process.env.NODE_ENV === 'production') {
            return reply.code(403).send({ error: 'Forbidden: Admin access only' });
        }
    });

    server.get('/config', (req, res) => controller.getConfig(req, res));
    server.patch('/config', (req, res) => controller.updateConfig(req, res));
    server.post('/config/reset', (req, res) => controller.resetConfig(req, res));
}
