import { FastifyReply, FastifyRequest } from 'fastify';
import { telemetryService } from '../../../services/telemetry.service';
import { FeedbackBodySchema, FeedbackParamsSchema } from '../schemas/feedback.schemas';

export class FeedbackController {
    async submitFeedback(request: FastifyRequest, reply: FastifyReply) {
        const { requestId } = FeedbackParamsSchema.parse(request.params);
        const { feedback } = FeedbackBodySchema.parse(request.body);

        const success = telemetryService.addFeedback(requestId, feedback);

        if (!success) {
            return reply.code(404).send({
                data: null,
                error: {
                    code: 'REQUEST_NOT_FOUND',
                    message: `Search request with ID ${requestId} not found in telemetry buffer.`
                },
                meta: { requestId: request.id }
            });
        }

        return {
            data: { success: true },
            error: null,
            meta: { requestId: request.id }
        };
    }
}
