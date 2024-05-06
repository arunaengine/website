/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2ClaimWorkspaceResponse } from '../models/v2ClaimWorkspaceResponse';
import type { v2CreateWorkspaceRequest } from '../models/v2CreateWorkspaceRequest';
import type { v2CreateWorkspaceResponse } from '../models/v2CreateWorkspaceResponse';
import type { v2CreateWorkspaceTemplateRequest } from '../models/v2CreateWorkspaceTemplateRequest';
import type { v2CreateWorkspaceTemplateResponse } from '../models/v2CreateWorkspaceTemplateResponse';
import type { v2DeleteWorkspaceResponse } from '../models/v2DeleteWorkspaceResponse';
import type { v2DeleteWorkspaceTemplateResponse } from '../models/v2DeleteWorkspaceTemplateResponse';
import type { v2GetWorkspaceTemplateResponse } from '../models/v2GetWorkspaceTemplateResponse';
import type { v2ListOwnedWorkspaceTemplatesResponse } from '../models/v2ListOwnedWorkspaceTemplatesResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WorkspaceServiceService {
    /**
     * CreateWorkspace
     * Status: ALPHA
     *
     * Create a personal anonymous workspace
     * @param body
     * @returns v2CreateWorkspaceResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceCreateWorkspace(
        body: v2CreateWorkspaceRequest,
    ): CancelablePromise<v2CreateWorkspaceResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/workspaces',
            body: body,
        });
    }
    /**
     * ListOwnedWorkspaceTemplates
     * Status: ALPHA
     *
     * Lists owned workspace templates
     * @returns v2ListOwnedWorkspaceTemplatesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceListOwnedWorkspaceTemplates(): CancelablePromise<v2ListOwnedWorkspaceTemplatesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/workspaces/templates',
        });
    }
    /**
     * CreatesNewWorkspaceTemplate
     * Status: ALPHA
     *
     * This will create a new template for workspaces (admin only)
     * @param body
     * @returns v2CreateWorkspaceTemplateResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceCreateWorkspaceTemplate(
        body: v2CreateWorkspaceTemplateRequest,
    ): CancelablePromise<v2CreateWorkspaceTemplateResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/workspaces/templates',
            body: body,
        });
    }
    /**
     * GetWorkspaceTemplatesById
     * Status: ALPHA
     *
     * Gets workspace template by id
     * @param templateId
     * @returns v2GetWorkspaceTemplateResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceGetWorkspaceTemplate(
        templateId: string,
    ): CancelablePromise<v2GetWorkspaceTemplateResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/workspaces/templates/{templateId}',
            path: {
                'templateId': templateId,
            },
        });
    }
    /**
     * DeleteWorkspaceTemplates
     * Status: ALPHA
     *
     * Deletes specified workspace templates
     * @param templateId
     * @param body
     * @returns v2DeleteWorkspaceTemplateResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceDeleteWorkspaceTemplate(
        templateId: string,
        body: any,
    ): CancelablePromise<v2DeleteWorkspaceTemplateResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/workspaces/templates/{templateId}',
            path: {
                'templateId': templateId,
            },
            body: body,
        });
    }
    /**
     * DeleteWorkspace
     * Status: ALPHA
     *
     * Delete a workspace
     * @param workspaceId
     * @param body
     * @returns v2DeleteWorkspaceResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceDeleteWorkspace(
        workspaceId: string,
        body: any,
    ): CancelablePromise<v2DeleteWorkspaceResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/workspaces/{workspaceId}',
            path: {
                'workspaceId': workspaceId,
            },
            body: body,
        });
    }
    /**
     * DeleteWorkspace
     * Status: ALPHA
     *
     * Claims an anonymous workspace, and transfers the owner to a regular user account.
     * @param workspaceId This can only be called by an registered user,
     * that is in possesion of the workspace_id and workspace token
     * It will remove the service account and claim all references "as" the user.
     * @param body
     * @returns v2ClaimWorkspaceResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static workspaceServiceClaimWorkspace(
        workspaceId: string,
        body: {
            token?: string;
        },
    ): CancelablePromise<v2ClaimWorkspaceResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/workspaces/{workspaceId}/claim',
            path: {
                'workspaceId': workspaceId,
            },
            body: body,
        });
    }
}
