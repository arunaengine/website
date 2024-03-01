/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2Context } from '../models/v2Context';
import type { v2CreateDataproxyTokenSvcAccountResponse } from '../models/v2CreateDataproxyTokenSvcAccountResponse';
import type { v2CreateServiceAccountRequest } from '../models/v2CreateServiceAccountRequest';
import type { v2CreateServiceAccountResponse } from '../models/v2CreateServiceAccountResponse';
import type { v2CreateServiceAccountTokenResponse } from '../models/v2CreateServiceAccountTokenResponse';
import type { v2DeleteServiceAccountResponse } from '../models/v2DeleteServiceAccountResponse';
import type { v2DeleteServiceAccountTokenResponse } from '../models/v2DeleteServiceAccountTokenResponse';
import type { v2DeleteServiceAccountTokensResponse } from '../models/v2DeleteServiceAccountTokensResponse';
import type { v2GetS3CredentialsSvcAccountResponse } from '../models/v2GetS3CredentialsSvcAccountResponse';
import type { v2GetServiceAccountTokenResponse } from '../models/v2GetServiceAccountTokenResponse';
import type { v2GetServiceAccountTokensResponse } from '../models/v2GetServiceAccountTokensResponse';
import type { v2Permission } from '../models/v2Permission';
import type { v2SetServiceAccountPermissionResponse } from '../models/v2SetServiceAccountPermissionResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ServiceAccountServiceService {
    /**
     * CreateServiceAccount
     * Status: BETA
     *
     * Creates a service account for a given project
     * If the service account has permissions for the global Admin project
     * it will be a global service account that can interact with any resource
     * @param body
     * @returns v2CreateServiceAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceCreateServiceAccount(
        body: v2CreateServiceAccountRequest,
    ): CancelablePromise<v2CreateServiceAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts',
            body: body,
        });
    }
    /**
     * DeleteServiceAccount
     * Status: BETA
     *
     * Deletes a service account (by id)
     * @param svcAccountId
     * @returns v2DeleteServiceAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceDeleteServiceAccount(
        svcAccountId: string,
    ): CancelablePromise<v2DeleteServiceAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/service_accounts/{svcAccountId}',
            path: {
                'svcAccountId': svcAccountId,
            },
        });
    }
    /**
     * SetServiceAccountPermission
     * Status: BETA
     *
     * Overwrites the project specific permissions for a service account
     * @param svcAccountId
     * @param body
     * @returns v2SetServiceAccountPermissionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceSetServiceAccountPermission(
        svcAccountId: string,
        body: {
            permission?: v2Permission;
        },
    ): CancelablePromise<v2SetServiceAccountPermissionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/v2/service_accounts/{svcAccountId}/permissions',
            path: {
                'svcAccountId': svcAccountId,
            },
            body: body,
        });
    }
    /**
     * GetDataproxyToken
     * Status: ALPHA
     *
     * Gets token for a specific user and data_proxy
     * @param svcAccountId
     * @param endpointId
     * @param body
     * @returns v2CreateDataproxyTokenSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceCreateDataproxyTokenSvcAccount(
        svcAccountId: string,
        endpointId: string,
        body: {
            context?: v2Context;
        },
    ): CancelablePromise<v2CreateDataproxyTokenSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts/{svcAccountId}/proxy_tokens/{endpointId}',
            path: {
                'svcAccountId': svcAccountId,
                'endpointId': endpointId,
            },
            body: body,
        });
    }
    /**
     * GetS3Credentials
     * Status: ALPHA
     *
     * Gets s3 credentials for a specific user and data_proxy
     * @param svcAccountId
     * @param endpointId
     * @returns v2GetS3CredentialsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceGetS3CredentialsSvcAccount(
        svcAccountId: string,
        endpointId?: string,
    ): CancelablePromise<v2GetS3CredentialsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/service_accounts/{svcAccountId}/s3_credentials',
            path: {
                'svcAccountId': svcAccountId,
            },
            query: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * GetServiceAccountTokens
     * Status: BETA
     *
     * This requests the overall information about all service account tokens
     * it will not contain the token itself.
     * @param svcAccountId
     * @returns v2GetServiceAccountTokensResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceGetServiceAccountTokens(
        svcAccountId: string,
    ): CancelablePromise<v2GetServiceAccountTokensResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/service_accounts/{svcAccountId}/tokens',
            path: {
                'svcAccountId': svcAccountId,
            },
        });
    }
    /**
     * DeleteServiceAccountTokens
     * Status: BETA
     *
     * Deletes all service account tokens
     * @param svcAccountId
     * @returns v2DeleteServiceAccountTokensResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceDeleteServiceAccountTokens(
        svcAccountId: string,
    ): CancelablePromise<v2DeleteServiceAccountTokensResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/service_accounts/{svcAccountId}/tokens',
            path: {
                'svcAccountId': svcAccountId,
            },
        });
    }
    /**
     * CreateServiceAccountToken
     * Status: BETA
     *
     * Creates a token for a service account
     * Each service account can only have one permission -> The token will have the same permission as the
     * service account or a subset of it.
     * @param svcAccountId
     * @param body
     * @returns v2CreateServiceAccountTokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceCreateServiceAccountToken(
        svcAccountId: string,
        body: {
            permission?: v2Permission;
            name?: string;
            expiresAt?: string;
        },
    ): CancelablePromise<v2CreateServiceAccountTokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts/{svcAccountId}/tokens',
            path: {
                'svcAccountId': svcAccountId,
            },
            body: body,
        });
    }
    /**
     * GetServiceAccountToken
     * Status: BETA
     *
     * This requests the overall information about a specifc service account token (by id)
     * it will not contain the token itself.
     * @param svcAccountId
     * @param tokenId
     * @returns v2GetServiceAccountTokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceGetServiceAccountToken(
        svcAccountId: string,
        tokenId: string,
    ): CancelablePromise<v2GetServiceAccountTokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/service_accounts/{svcAccountId}/tokens/{tokenId}',
            path: {
                'svcAccountId': svcAccountId,
                'tokenId': tokenId,
            },
        });
    }
    /**
     * DeleteServiceAccountToken
     * Status: BETA
     *
     * Deletes one service account token by ID
     * @param svcAccountId
     * @param tokenId
     * @returns v2DeleteServiceAccountTokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceDeleteServiceAccountToken(
        svcAccountId: string,
        tokenId: string,
    ): CancelablePromise<v2DeleteServiceAccountTokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/service_accounts/{svcAccountId}/tokens/{tokenId}',
            path: {
                'svcAccountId': svcAccountId,
                'tokenId': tokenId,
            },
        });
    }
}
