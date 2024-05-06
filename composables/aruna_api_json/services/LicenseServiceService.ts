/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2CreateLicenseRequest } from '../models/v2CreateLicenseRequest';
import type { v2CreateLicenseResponse } from '../models/v2CreateLicenseResponse';
import type { v2GetLicenseResponse } from '../models/v2GetLicenseResponse';
import type { v2ListLicensesResponse } from '../models/v2ListLicensesResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class LicenseServiceService {
    /**
     * ListLicenses
     * Status: BETA
     *
     * This returns a list of all licenses
     * @returns v2ListLicensesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static licenseServiceListLicenses(): CancelablePromise<v2ListLicensesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/licenses',
        });
    }
    /**
     * CreateLicense
     * Status: BETA
     *
     * This creates a new license
     * @param body Request object for CreateLicense
     * @returns v2CreateLicenseResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static licenseServiceCreateLicense(
        body: v2CreateLicenseRequest,
    ): CancelablePromise<v2CreateLicenseResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/licenses',
            body: body,
        });
    }
    /**
     * GetLicense
     * Status: BETA
     *
     * This returns the license for a given tag
     * @param tag 1234567890abcdef
     * @returns v2GetLicenseResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static licenseServiceGetLicense(
        tag: string,
    ): CancelablePromise<v2GetLicenseResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/licenses/{tag}',
            path: {
                'tag': tag,
            },
        });
    }
}
