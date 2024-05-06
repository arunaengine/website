/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2AddProjectsToHookResponse } from '../models/v2AddProjectsToHookResponse';
import type { v2CreateHookRequest } from '../models/v2CreateHookRequest';
import type { v2CreateHookResponse } from '../models/v2CreateHookResponse';
import type { v2DeleteHookResponse } from '../models/v2DeleteHookResponse';
import type { v2HookCallbackRequest } from '../models/v2HookCallbackRequest';
import type { v2HookCallbackResponse } from '../models/v2HookCallbackResponse';
import type { v2ListOwnedHooksResponse } from '../models/v2ListOwnedHooksResponse';
import type { v2ListProjectHooksResponse } from '../models/v2ListProjectHooksResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class HooksServiceService {
    /**
     * CreateHook
     * Status: ALPHA
     *
     * Creates a replication request
     * Hooks are always associated with the owner that created the hook
     * @param body
     * @returns v2CreateHookResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceCreateHook(
        body: v2CreateHookRequest,
    ): CancelablePromise<v2CreateHookResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/hooks',
            body: body,
        });
    }
    /**
     * Callback API
     * Status: ALPHA
     *
     * Externally triggered hooks should respond to this endpoint to
     * signal completion or failure and to provide additional flags for the object
     * @param body
     * @returns v2HookCallbackResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceHookCallback(
        body: v2HookCallbackRequest,
    ): CancelablePromise<v2HookCallbackResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/hooks/callback',
            body: body,
        });
    }
    /**
     * ListOwnedHooks
     * Status: ALPHA
     *
     * List all hooks created by a user
     * @param userId ADMIN only
     * @returns v2ListOwnedHooksResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceListOwnedHooks(
        userId: string,
    ): CancelablePromise<v2ListOwnedHooksResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/hooks/owner/{userId}',
            path: {
                'userId': userId,
            },
        });
    }
    /**
     * ListProjectHooks
     * Status: ALPHA
     *
     * List all hooks assigned to a project
     * @param projectId
     * @returns v2ListProjectHooksResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceListProjectHooks(
        projectId: string,
    ): CancelablePromise<v2ListProjectHooksResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/hooks/projects/{projectId}',
            path: {
                'projectId': projectId,
            },
        });
    }
    /**
     * DeleteHook
     * Status: ALPHA
     *
     * Delete a hook by id
     * @param hookId
     * @returns v2DeleteHookResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceDeleteHook(
        hookId: string,
    ): CancelablePromise<v2DeleteHookResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/hooks/{hookId}',
            path: {
                'hookId': hookId,
            },
        });
    }
    /**
     * AddProjectsToHook
     * Status: ALPHA
     *
     * Assigns a hook to a project
     * @param hookId
     * @param body
     * @returns v2AddProjectsToHookResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static hooksServiceAddProjectsToHook(
        hookId: string,
        body: {
            projectIds?: Array<string>;
        },
    ): CancelablePromise<v2AddProjectsToHookResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/hooks/{hookId}',
            path: {
                'hookId': hookId,
            },
            body: body,
        });
    }
}
