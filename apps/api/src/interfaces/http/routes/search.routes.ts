import { FastifyInstance } from 'fastify';
import { SearchController } from '../controllers/search.controller';
import { ImageSearchService } from '../../../services/image-search.service';
import { GeminiVisionSignalExtractor } from '../../../infra/ai/gemini/gemini-vision.service';
import { GeminiCatalogReranker } from '../../../infra/ai/gemini/gemini-reranker.service';
import { CatalogRepository } from '../../../infra/repositories/catalog.repository';

export async function searchRoutes(server: FastifyInstance) {
    // Composition Root for Search (using manual DI for now)
    const repo = new CatalogRepository();
    const vision = new GeminiVisionSignalExtractor();
    const reranker = new GeminiCatalogReranker();
    const service = new ImageSearchService(vision, repo, reranker, server.log);
    const controller = new SearchController(service);

    server.post('/image', (req, res) => controller.searchByImage(req, res));
}
