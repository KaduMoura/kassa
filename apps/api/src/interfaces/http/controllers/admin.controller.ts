import { FastifyReply, FastifyRequest } from 'fastify';
import { appConfigService } from '../../../config/app-config.service';

export class AdminController {
    /**
     * Get system configuration (e.g., search weights, thresholds)
     */
    async getConfig(request: FastifyRequest, reply: FastifyReply) {
        const config = appConfigService.getConfig();
        return {
            data: config,
            meta: { requestId: request.id },
            error: null
        };
    }

    /**
     * Update system configuration
     */
    async updateConfig(request: FastifyRequest, reply: FastifyReply) {
        const body = request.body as any;

        try {
            const updatedConfig = appConfigService.updateConfig(body);
            request.log.info({ body }, 'Updated admin configuration');

            return {
                data: updatedConfig,
                message: 'Configuration updated successfully (volatile)',
                meta: { requestId: request.id },
                error: null
            };
        } catch (error: any) {
            return reply.code(400).send({
                error: 'Invalid configuration',
                details: error.errors || error.message,
                meta: { requestId: request.id }
            });
        }
    }

    /**
     * Reset system configuration to defaults
     */
    async resetConfig(request: FastifyRequest, reply: FastifyReply) {
        const config = appConfigService.resetToDefaults();
        return {
            data: config,
            message: 'Configuration reset to defaults',
            meta: { requestId: request.id },
            error: null
        };
    }
}
