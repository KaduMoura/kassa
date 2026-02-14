import { FastifyReply, FastifyRequest } from 'fastify';
import { appConfigService } from '../../../config/app-config.service';
import { telemetryService } from '../../../services/telemetry.service';

export class AdminController {
    /**
     * Get system configuration (e.g., search weights, thresholds)
     */
    async getConfig(request: FastifyRequest, reply: FastifyReply) {
        const config = appConfigService.getConfig();
        return {
            data: config,
            error: null,
            meta: { requestId: request.id }
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
                error: null,
                meta: {
                    requestId: request.id,
                    notices: [{ code: 'CONFIG_UPDATED', message: 'Configuration updated successfully (volatile)' }]
                }
            };
        } catch (error: any) {
            // Re-throw to be handled by the global error handler which is now standardized
            throw error;
        }
    }

    /**
     * Reset system configuration to defaults
     */
    async resetConfig(request: FastifyRequest, reply: FastifyReply) {
        const config = appConfigService.resetToDefaults();
        return {
            data: config,
            error: null,
            meta: {
                requestId: request.id,
                notices: [{ code: 'CONFIG_RESET', message: 'Configuration reset to defaults' }]
            }
        };
    }

    /**
     * Get recent search telemetry (last 50 executions)
     */
    async getTelemetry(request: FastifyRequest, reply: FastifyReply) {
        const events = telemetryService.getEvents();
        return {
            data: events,
            error: null,
            meta: {
                requestId: request.id,
                count: events.length
            }
        };
    }
}
