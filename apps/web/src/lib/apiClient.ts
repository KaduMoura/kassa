import { ApiResponse, SearchResponseData } from '../types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * API Client for interacting with the Inspira AI backend.
 */
export const apiClient = {
    /**
     * Searches for products using an image and an optional text prompt.
     * Uses multipart/form-data for the request body.
     */
    async searchProducts(
        image: File,
        apiKey: string,
        prompt?: string
    ): Promise<ApiResponse<SearchResponseData>> {
        const formData = new FormData();
        formData.append('image', image);
        if (prompt) {
            formData.append('prompt', prompt);
        }

        try {
            const response = await fetch(`${BASE_URL}/api/search`, {
                method: 'POST',
                headers: {
                    'x-ai-api-key': apiKey,
                    // Note: Content-Type header is omitted to let the browser set the boundary
                },
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                const error = result.error || { message: response.statusText };
                throw {
                    code: error.code || 'API_ERROR',
                    message: error.message,
                    details: error.details,
                    status: response.status,
                };
            }

            return result;
        } catch (error: any) {
            // Re-throw standardized error if it's not already one
            if (error.code) throw error;
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to connect to the server',
                status: 0,
            };
        }
    },

    /**
     * Fetches the current admin configuration.
     */
    async getAdminConfig(adminToken: string): Promise<ApiResponse<any>> {
        try {
            const response = await fetch(`${BASE_URL}/api/config`, {
                headers: {
                    'x-admin-token': adminToken,
                },
            });
            return response.json();
        } catch (error: any) {
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to fetch config',
            };
        }
    },

    /**
     * Updates the admin configuration.
     */
    async updateAdminConfig(adminToken: string, config: any): Promise<ApiResponse<any>> {
        try {
            const response = await fetch(`${BASE_URL}/api/config`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-token': adminToken,
                },
                body: JSON.stringify(config),
            });
            return response.json();
        } catch (error: any) {
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to update config',
            };
        }
    },

    /**
     * Resets the admin configuration to defaults.
     */
    async resetAdminConfig(adminToken: string): Promise<ApiResponse<any>> {
        try {
            const response = await fetch(`${BASE_URL}/api/config/reset`, {
                method: 'POST',
                headers: {
                    'x-admin-token': adminToken,
                },
            });
            return response.json();
        } catch (error: any) {
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to reset config',
            };
        }
    },

    /**
     * Fetches the recent telemetry events.
     */
    async getTelemetry(adminToken: string): Promise<ApiResponse<any[]>> {
        try {
            const response = await fetch(`${BASE_URL}/api/telemetry`, {
                headers: {
                    'x-admin-token': adminToken,
                },
            });
            return response.json();
        } catch (error: any) {
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to fetch telemetry',
            };
        }
    },

    /**
     * Submits user feedback for a specific search request.
     */
    async submitFeedback(
        requestId: string,
        feedback: { items: Record<string, 'thumbs_up' | 'thumbs_down'>, notes?: string }
    ): Promise<ApiResponse<{ success: boolean }>> {
        try {
            const response = await fetch(`${BASE_URL}/api/feedback/${requestId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ feedback }),
            });
            return response.json();
        } catch (error: any) {
            throw {
                code: 'NETWORK_ERROR',
                message: error.message || 'Failed to submit feedback',
            };
        }
    }
};
