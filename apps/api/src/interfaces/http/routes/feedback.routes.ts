import { FastifyInstance } from 'fastify';
import { FeedbackController } from '../controllers/feedback.controller';

export async function feedbackRoutes(fastify: FastifyInstance) {
    const controller = new FeedbackController();

    fastify.post('/:requestId', (req, reply) => controller.submitFeedback(req, reply));
}
