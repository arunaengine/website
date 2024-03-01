/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2GetResourceResponse } from '../models/v2GetResourceResponse';
import type { v2GetResourcesResponse } from '../models/v2GetResourcesResponse';
import type { v2RequestResourceAccessResponse } from '../models/v2RequestResourceAccessResponse';
import type { v2SearchResourcesRequest } from '../models/v2SearchResourcesRequest';
import type { v2SearchResourcesResponse } from '../models/v2SearchResourcesResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SearchServiceService {
    /**
     * GetResources
     * Status: BETA
     *
     * Retrieves resources by a list of IDs.
     * @param resourceIds
     * @returns v2GetResourcesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static searchServiceGetResources(
        resourceIds?: Array<string>,
    ): CancelablePromise<v2GetResourcesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/resources',
            query: {
                'resourceIds': resourceIds,
            },
        });
    }
    /**
     * GetResource
     * Status: BETA
     *
     * Retrieves resource by its ID.
     * @param resourceId
     * @returns v2GetResourceResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static searchServiceGetResource(
        resourceId: string,
    ): CancelablePromise<v2GetResourceResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/resources/{resourceId}',
            path: {
                'resourceId': resourceId,
            },
        });
    }
    /**
     * RequestResourceAccess
     * Status: ALPHA
     *
     * Requests access to resources
     * @param resourceId
     * @param message
     * @returns v2RequestResourceAccessResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static searchServiceRequestResourceAccess(
        resourceId: string,
        message?: string,
    ): CancelablePromise<v2RequestResourceAccessResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/resources/{resourceId}/access',
            path: {
                'resourceId': resourceId,
            },
            query: {
                'message': message,
            },
        });
    }
    /**
     * SearchResources
     * Status: BETA
     *
     * Searches the index for applicable resources (only public + private can be searched)
     * @param body
     * @returns v2SearchResourcesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static searchServiceSearchResources(
        body: v2SearchResourcesRequest,
    ): CancelablePromise<v2SearchResourcesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/search',
            body: body,
        });
    }
}
