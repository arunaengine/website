/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2GetHierarchyResponse } from '../models/v2GetHierarchyResponse';
import type { v2ModifyRelationsRequest } from '../models/v2ModifyRelationsRequest';
import type { v2ModifyRelationsResponse } from '../models/v2ModifyRelationsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class RelationsServiceService {
    /**
     * ModifyRelation
     * Status: BETA
     *
     * Add/Remove/Modifies all relation types to / from a resource
     * Works for internal and external relations
     * @param body
     * @returns v2ModifyRelationsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static relationsServiceModifyRelations(
        body: v2ModifyRelationsRequest,
    ): CancelablePromise<v2ModifyRelationsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/relations',
            body: body,
        });
    }
    /**
     * GetHierachy
     * Status: BETA
     *
     * Gets all downstream hierarchy relations from a resource
     * results in a tree structure
     * @param resourceId
     * @returns v2GetHierarchyResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static relationsServiceGetHierarchy(
        resourceId: string,
    ): CancelablePromise<v2GetHierarchyResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/relations/{resourceId}/hierarchy',
            path: {
                'resourceId': resourceId,
            },
        });
    }
}
