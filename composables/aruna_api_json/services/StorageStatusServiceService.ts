/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2GetAnnouncementsResponse } from '../models/v2GetAnnouncementsResponse';
import type { v2GetPubkeysResponse } from '../models/v2GetPubkeysResponse';
import type { v2GetStorageStatusResponse } from '../models/v2GetStorageStatusResponse';
import type { v2GetStorageVersionResponse } from '../models/v2GetStorageVersionResponse';
import type { v2SetAnnouncementsRequest } from '../models/v2SetAnnouncementsRequest';
import type { v2SetAnnouncementsResponse } from '../models/v2SetAnnouncementsResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class StorageStatusServiceService {
    /**
     * GetAnnouncements
     * Status: BETA
     *
     * Query global announcements
     * @returns v2GetAnnouncementsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static storageStatusServiceGetAnnouncements(): CancelablePromise<v2GetAnnouncementsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/info/announcements',
        });
    }
    /**
     * SetAnnouncements
     * Status: BETA
     *
     * Update / add global announcements
     * @param body
     * @returns v2SetAnnouncementsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static storageStatusServiceSetAnnouncements(
        body: v2SetAnnouncementsRequest,
    ): CancelablePromise<v2SetAnnouncementsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/info/announcements/set',
            body: body,
        });
    }
    /**
     * GetPubkeys
     * Status: BETA
     *
     * Get all public keys of all storage components
     * @returns v2GetPubkeysResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static storageStatusServiceGetPubkeys(): CancelablePromise<v2GetPubkeysResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/info/pubkeys',
        });
    }
    /**
     * GetStorageStatus
     * Status: ALPHA
     *
     * A request to get the current status of the storage components by location(s)
     * @returns v2GetStorageStatusResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static storageStatusServiceGetStorageStatus(): CancelablePromise<v2GetStorageStatusResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/info/status',
        });
    }
    /**
     * GetStorageVersion
     * Status: BETA
     *
     * A request to get the current version of the server application
     * String representation and https://semver.org/
     * @returns v2GetStorageVersionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static storageStatusServiceGetStorageVersion(): CancelablePromise<v2GetStorageVersionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/info/version',
        });
    }
}
