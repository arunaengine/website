/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2CreateEndpointRequest } from '../models/v2CreateEndpointRequest';
import type { v2CreateEndpointResponse } from '../models/v2CreateEndpointResponse';
import type { v2DeleteEndpointResponse } from '../models/v2DeleteEndpointResponse';
import type { v2FullSyncEndpointResponse } from '../models/v2FullSyncEndpointResponse';
import type { v2GetDefaultEndpointResponse } from '../models/v2GetDefaultEndpointResponse';
import type { v2GetEndpointResponse } from '../models/v2GetEndpointResponse';
import type { v2GetEndpointsResponse } from '../models/v2GetEndpointsResponse';
import type { v2SetEndpointStatusResponse } from '../models/v2SetEndpointStatusResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EndpointServiceService {
    /**
     * GetEndpoints
     * Status: BETA
     *
     * Gets all available endpoints
     * @returns v2GetEndpointsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceGetEndpoints(): CancelablePromise<v2GetEndpointsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/endpoints',
        });
    }
    /**
     * CreateEndpoint
     * Status: BETA
     *
     * Registers a new Endpoint (Aruna DataProxy) to the server
     * requires admin permissions
     * @param body
     * @returns v2CreateEndpointResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceCreateEndpoint(
        body: v2CreateEndpointRequest,
    ): CancelablePromise<v2CreateEndpointResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/endpoints',
            body: body,
        });
    }
    /**
     * GetDefaultEndpoint
     * Status: BETA
     *
     * This request returns the default endpoint for the current aruna_server
     * It may produce different results depending on the used server
     * @returns v2GetDefaultEndpointResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceGetDefaultEndpoint(): CancelablePromise<v2GetDefaultEndpointResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/endpoints/default',
        });
    }
    /**
     * FullSyncEndpoint
     * Status: BETA
     *
     * Requests a full sync of all endpoint related data
     * @returns any A successful response.(streaming responses)
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceFullSyncEndpoint(): CancelablePromise<{
        result?: v2FullSyncEndpointResponse;
        error?: googlerpcStatus;
    } | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/endpoints/sync',
        });
    }
    /**
     * GetEndpoint
     * Status: BETA
     *
     * Gets an specific endpoint by ID or Name
     * @param endpointId Id of the endpoint
     * @param endpointName The name of the endpoint
     * @returns v2GetEndpointResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceGetEndpoint(
        endpointId: string,
        endpointName?: string,
    ): CancelablePromise<v2GetEndpointResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/endpoints/{endpointId}',
            path: {
                'endpointId': endpointId,
            },
            query: {
                'endpointName': endpointName,
            },
        });
    }
    /**
     * DeleteEndpoint
     * Status: BETA
     *
     * Deletes a specific endpoint by id
     * This needs admin permissions
     * @param endpointId Endpoint_id to delete
     * @returns v2DeleteEndpointResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceDeleteEndpoint(
        endpointId: string,
    ): CancelablePromise<v2DeleteEndpointResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/endpoints/{endpointId}',
            path: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * SetEndpointStatus
     * Status: BETA
     *
     * This request sets the status of a specific Endpoint
     * @param endpointId
     * @param status
     * @returns v2SetEndpointStatusResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static endpointServiceSetEndpointStatus(
        endpointId: string,
        status: 'COMPONENT_STATUS_UNSPECIFIED' | 'COMPONENT_STATUS_INITIALIZING' | 'COMPONENT_STATUS_AVAILABLE' | 'COMPONENT_STATUS_DEGRADED' | 'COMPONENT_STATUS_UNAVAILABLE' | 'COMPONENT_STATUS_MAINTENANCE' = 'COMPONENT_STATUS_UNSPECIFIED',
    ): CancelablePromise<v2SetEndpointStatusResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/endpoints/{endpointId}/status',
            path: {
                'endpointId': endpointId,
            },
            query: {
                'status': status,
            },
        });
    }
}
