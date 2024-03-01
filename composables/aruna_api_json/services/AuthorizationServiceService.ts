/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2CreateAuthorizationRequest } from '../models/v2CreateAuthorizationRequest';
import type { v2CreateAuthorizationResponse } from '../models/v2CreateAuthorizationResponse';
import type { v2DeleteAuthorizationResponse } from '../models/v2DeleteAuthorizationResponse';
import type { v2GetAuthorizationsResponse } from '../models/v2GetAuthorizationsResponse';
import type { v2PermissionLevel } from '../models/v2PermissionLevel';
import type { v2UpdateAuthorizationResponse } from '../models/v2UpdateAuthorizationResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthorizationServiceService {
    /**
     * CreateAuthorization
     * Status: BETA
     *
     * This creates a user-specific attribute that handles permission for a
     * specific resource
     * @param body
     * @returns v2CreateAuthorizationResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static authorizationServiceCreateAuthorization(
        body: v2CreateAuthorizationRequest,
    ): CancelablePromise<v2CreateAuthorizationResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/authorizations',
            body: body,
        });
    }
    /**
     * GetAuthorization
     * Status: BETA
     *
     * This gets resource specific user authorizations
     * @param resourceId
     * @param recursive
     * @returns v2GetAuthorizationsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static authorizationServiceGetAuthorizations(
        resourceId: string,
        recursive?: boolean,
    ): CancelablePromise<v2GetAuthorizationsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/authorizations/{resourceId}',
            path: {
                'resourceId': resourceId,
            },
            query: {
                'recursive': recursive,
            },
        });
    }
    /**
     * DeleteAuthorization
     * Status: BETA
     *
     * This deletes a user-specific attribute that handles permission for a
     * specific resource
     * @param resourceId
     * @param body
     * @returns v2DeleteAuthorizationResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static authorizationServiceDeleteAuthorization(
        resourceId: string,
        body: {
            userId?: string;
        },
    ): CancelablePromise<v2DeleteAuthorizationResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/authorizations/{resourceId}',
            path: {
                'resourceId': resourceId,
            },
            body: body,
        });
    }
    /**
     * UpdateAuthorization
     * Status: BETA
     *
     * This creates a user-specific attribute that handles permission for a
     * specific resource
     * @param resourceId
     * @param body
     * @returns v2UpdateAuthorizationResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static authorizationServiceUpdateAuthorization(
        resourceId: string,
        body: {
            userId?: string;
            permissionLevel?: v2PermissionLevel;
        },
    ): CancelablePromise<v2UpdateAuthorizationResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/authorizations/{resourceId}',
            path: {
                'resourceId': resourceId,
            },
            body: body,
        });
    }
}
