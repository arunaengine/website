/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2ArchiveProjectResponse } from '../models/v2ArchiveProjectResponse';
import type { v2Author } from '../models/v2Author';
import type { v2CreateProjectRequest } from '../models/v2CreateProjectRequest';
import type { v2CreateProjectResponse } from '../models/v2CreateProjectResponse';
import type { v2DataClass } from '../models/v2DataClass';
import type { v2DeleteProjectResponse } from '../models/v2DeleteProjectResponse';
import type { v2GetProjectResponse } from '../models/v2GetProjectResponse';
import type { v2GetProjectsResponse } from '../models/v2GetProjectsResponse';
import type { v2KeyValue } from '../models/v2KeyValue';
import type { v2UpdateProjectAuthorsResponse } from '../models/v2UpdateProjectAuthorsResponse';
import type { v2UpdateProjectDataClassResponse } from '../models/v2UpdateProjectDataClassResponse';
import type { v2UpdateProjectDescriptionResponse } from '../models/v2UpdateProjectDescriptionResponse';
import type { v2UpdateProjectKeyValuesResponse } from '../models/v2UpdateProjectKeyValuesResponse';
import type { v2UpdateProjectLicensesResponse } from '../models/v2UpdateProjectLicensesResponse';
import type { v2UpdateProjectNameResponse } from '../models/v2UpdateProjectNameResponse';
import type { v2UpdateProjectTitleResponse } from '../models/v2UpdateProjectTitleResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProjectServiceService {
    /**
     * UpdateAuthors
     * Status: ALPHA
     *
     * This method updates the authors of an object
     * @param projectId Project id
     * @param body
     * @returns v2UpdateProjectAuthorsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectAuthors(
        projectId: string,
        body: {
            addAuthors?: Array<v2Author>;
            removeAuthors?: Array<v2Author>;
        },
    ): CancelablePromise<v2UpdateProjectAuthorsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/project/{projectId}/authors',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateTitle
     * Status: ALPHA
     *
     * This method updates the title of a project
     * @param projectId Project id
     * @param body
     * @returns v2UpdateProjectTitleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectTitle(
        projectId: string,
        body: {
            title?: string;
        },
    ): CancelablePromise<v2UpdateProjectTitleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/project/{projectId}/title',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * GetProjects
     * Status: BETA
     *
     * Admin request to get all projects
     * @param projectIds optional filter for specific ids
     * @returns v2GetProjectsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceGetProjects(
        projectIds?: Array<string>,
    ): CancelablePromise<v2GetProjectsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/projects',
            query: {
                'projectIds': projectIds,
            },
        });
    }
    /**
     * CreateProject
     * Status: BETA
     *
     * Creates a new project. All subsequent resources are part of a project.
     * @param body
     * @returns v2CreateProjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceCreateProject(
        body: v2CreateProjectRequest,
    ): CancelablePromise<v2CreateProjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/projects',
            body: body,
        });
    }
    /**
     * GetProject
     * Status: BETA
     *
     * Requests a project (by id)
     * @param projectId The id of the project to get
     * @returns v2GetProjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceGetProject(
        projectId: string,
    ): CancelablePromise<v2GetProjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/projects/{projectId}',
            path: {
                'projectId': projectId,
            },
        });
    }
    /**
     * DeleteProject
     * Status: BETA
     *
     * Deletes the project and all its associated data. Must be empty!
     * @param projectId The id of the project to destroy
     * @returns v2DeleteProjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceDeleteProject(
        projectId: string,
    ): CancelablePromise<v2DeleteProjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/projects/{projectId}',
            path: {
                'projectId': projectId,
            },
        });
    }
    /**
     * ArchiveProjectRequest
     * Status: BETA
     *
     * Archives the full project, rendering all downstream relations immutable
     * @param projectId
     * @param body
     * @returns v2ArchiveProjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceArchiveProject(
        projectId: string,
        body: any,
    ): CancelablePromise<v2ArchiveProjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/projects/{projectId}/archive',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateProjectDataClass
     * Status: BETA
     *
     * Updates the project name. All (meta) data will be overwritten.
     * @param projectId
     * @param body
     * @returns v2UpdateProjectDataClassResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectDataClass(
        projectId: string,
        body: {
            dataClass?: v2DataClass;
        },
    ): CancelablePromise<v2UpdateProjectDataClassResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/projects/{projectId}/data_class',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateProjectDescription
     * Status: BETA
     *
     * Updates the project name.
     * @param projectId
     * @param body
     * @returns v2UpdateProjectDescriptionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectDescription(
        projectId: string,
        body: {
            description?: string;
        },
    ): CancelablePromise<v2UpdateProjectDescriptionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/projects/{projectId}/description',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateProjectKeyValues
     * Status: BETA
     *
     * Updates the project key values.
     * @param projectId
     * @param body
     * @returns v2UpdateProjectKeyValuesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectKeyValues(
        projectId: string,
        body: {
            addKeyValues?: Array<v2KeyValue>;
            removeKeyValues?: Array<v2KeyValue>;
        },
    ): CancelablePromise<v2UpdateProjectKeyValuesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/projects/{projectId}/key_values',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateLicense
     * Status: BETA
     *
     * Updates the project license. All (meta) data will be overwritten.
     * @param projectId
     * @param body
     * @returns v2UpdateProjectLicensesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectLicenses(
        projectId: string,
        body: {
            metadataLicenseTag?: string;
            defaultDataLicenseTag?: string;
        },
    ): CancelablePromise<v2UpdateProjectLicensesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/projects/{projectId}/licenses',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * UpdateProjectName
     * Status: BETA
     *
     * Updates the project name. Caveat! Will rename the "s3 bucket" for data proxies!
     * @param projectId
     * @param body
     * @returns v2UpdateProjectNameResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static projectServiceUpdateProjectName(
        projectId: string,
        body: {
            name?: string;
        },
    ): CancelablePromise<v2UpdateProjectNameResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/projects/{projectId}/name',
            path: {
                'projectId': projectId,
            },
            body: body,
        });
    }
}
