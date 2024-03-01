/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { apistorageservicesv2ReplicationStatus } from '../models/apistorageservicesv2ReplicationStatus';
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2DeleteReplicationResponse } from '../models/v2DeleteReplicationResponse';
import type { v2GetReplicationStatusResponse } from '../models/v2GetReplicationStatusResponse';
import type { v2PartialReplicateDataResponse } from '../models/v2PartialReplicateDataResponse';
import type { v2ReplicateProjectDataResponse } from '../models/v2ReplicateProjectDataResponse';
import type { v2UpdateReplicationStatusResponse } from '../models/v2UpdateReplicationStatusResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DataReplicationServiceService {
    /**
     * ReplicateProjectData
     * Status: ALPHA
     *
     * Replicates the (full) project data from one endpoint to another
     * @param endpointId
     * @param projectId
     * @param body
     * @returns v2ReplicateProjectDataResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static dataReplicationServiceReplicateProjectData(
        endpointId: string,
        projectId: string,
        body: any,
    ): CancelablePromise<v2ReplicateProjectDataResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/endpoints/{endpointId}/replication/{projectId}',
            path: {
                'endpointId': endpointId,
                'projectId': projectId,
            },
            body: body,
        });
    }
    /**
     * DeleteReplication
     * Status: ALPHA
     *
     * Delete the replication status of a project
     * @param endpointId
     * @param resourceId
     * @returns v2DeleteReplicationResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static dataReplicationServiceDeleteReplication(
        endpointId: string,
        resourceId: string,
    ): CancelablePromise<v2DeleteReplicationResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/endpoints/{endpointId}/replication/{resourceId}',
            path: {
                'endpointId': endpointId,
                'resourceId': resourceId,
            },
        });
    }
    /**
     * PartialReplicateData
     * Status: ALPHA
     *
     * Partial replicate data between endpoints
     * @param endpointId
     * @param resourceId
     * @param body
     * @returns v2PartialReplicateDataResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static dataReplicationServicePartialReplicateData(
        endpointId: string,
        resourceId: string,
        body: any,
    ): CancelablePromise<v2PartialReplicateDataResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/endpoints/{endpointId}/replication/{resourceId}/partial',
            path: {
                'endpointId': endpointId,
                'resourceId': resourceId,
            },
            body: body,
        });
    }
    /**
     * GetReplicationStatus
     * Status: ALPHA
     *
     * Get the replication status of a project
     * @param endpointId
     * @param resourceId
     * @returns v2GetReplicationStatusResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static dataReplicationServiceGetReplicationStatus(
        endpointId: string,
        resourceId: string,
    ): CancelablePromise<v2GetReplicationStatusResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/endpoints/{endpointId}/replication/{resourceId}/status',
            path: {
                'endpointId': endpointId,
                'resourceId': resourceId,
            },
        });
    }
    /**
     * UpdateReplicationStatus
     * Status: ALPHA
     *
     * Update the replication status of a project
     * @param endpointId
     * @param resourceId
     * @param body
     * @returns v2UpdateReplicationStatusResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static dataReplicationServiceUpdateReplicationStatus(
        endpointId: string,
        resourceId: string,
        body: {
            status?: apistorageservicesv2ReplicationStatus;
        },
    ): CancelablePromise<v2UpdateReplicationStatusResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/endpoints/{endpointId}/replication/{resourceId}/status',
            path: {
                'endpointId': endpointId,
                'resourceId': resourceId,
            },
            body: body,
        });
    }
}
