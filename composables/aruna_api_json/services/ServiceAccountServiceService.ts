/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2AddDataProxyAttributeSvcAccountResponse } from '../models/v2AddDataProxyAttributeSvcAccountResponse';
import type { v2AddPubkeySvcAccountResponse } from '../models/v2AddPubkeySvcAccountResponse';
import type { v2AddTrustedEndpointsSvcAccountResponse } from '../models/v2AddTrustedEndpointsSvcAccountResponse';
import type { v2Context } from '../models/v2Context';
import type { v2CreateDataproxyTokenSvcAccountResponse } from '../models/v2CreateDataproxyTokenSvcAccountResponse';
import type { v2CreateS3CredentialsSvcAccountResponse } from '../models/v2CreateS3CredentialsSvcAccountResponse';
import type { v2CreateServiceAccountRequest } from '../models/v2CreateServiceAccountRequest';
import type { v2CreateServiceAccountResponse } from '../models/v2CreateServiceAccountResponse';
import type { v2CreateServiceAccountTokenResponse } from '../models/v2CreateServiceAccountTokenResponse';
import type { v2DataProxyAttribute } from '../models/v2DataProxyAttribute';
import type { v2DeleteS3CredentialsSvcAccountResponse } from '../models/v2DeleteS3CredentialsSvcAccountResponse';
import type { v2DeleteServiceAccountResponse } from '../models/v2DeleteServiceAccountResponse';
import type { v2DeleteServiceAccountTokenResponse } from '../models/v2DeleteServiceAccountTokenResponse';
import type { v2DeleteServiceAccountTokensResponse } from '../models/v2DeleteServiceAccountTokensResponse';
import type { v2GetS3CredentialsSvcAccountResponse } from '../models/v2GetS3CredentialsSvcAccountResponse';
import type { v2GetServiceAccountTokenResponse } from '../models/v2GetServiceAccountTokenResponse';
import type { v2GetServiceAccountTokensResponse } from '../models/v2GetServiceAccountTokensResponse';
import type { v2Permission } from '../models/v2Permission';
import type { v2RemoveDataProxyAttributeSvcAccountResponse } from '../models/v2RemoveDataProxyAttributeSvcAccountResponse';
import type { v2RemoveTrustedEndpointsSvcAccountResponse } from '../models/v2RemoveTrustedEndpointsSvcAccountResponse';
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
     * RemoveDataProxyAttributeSvcAccount
     * Status: ALPHA
     *
     * Removes an data proxy specific attribute from the SvcAccount
     * @param svcAccountId
     * @param dataproxyId
     * @param attributeName
     * @returns v2RemoveDataProxyAttributeSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceRemoveDataProxyAttributeSvcAccount(
        svcAccountId: string,
        dataproxyId?: string,
        attributeName?: string,
    ): CancelablePromise<v2RemoveDataProxyAttributeSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/service_accounts/{svcAccountId}/attributes/data_proxy',
            path: {
                'svcAccountId': svcAccountId,
            },
            query: {
                'dataproxyId': dataproxyId,
                'attributeName': attributeName,
            },
        });
    }
    /**
     * AddDataProxyAttributeSvcAccount
     * Status: ALPHA
     *
     * Adds an data proxy specific attribute to the SvcAccount
     * @param svcAccountId
     * @param body
     * @returns v2AddDataProxyAttributeSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceAddDataProxyAttributeSvcAccount(
        svcAccountId: string,
        body: {
            attribute?: v2DataProxyAttribute;
        },
    ): CancelablePromise<v2AddDataProxyAttributeSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts/{svcAccountId}/attributes/data_proxy',
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
     * Gets token for a specific SvcAccount and data_proxy
     * @param svcAccountId Needs to be provided by project admins
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
     * AddPubkeySvcAccount
     * Status: ALPHA
     *
     * Adds an ED25519 public key for the SvcAccount
     * @param svcAccountId
     * @param body
     * @returns v2AddPubkeySvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceAddPubkeySvcAccount(
        svcAccountId: string,
        body: {
            publicKey?: string;
        },
    ): CancelablePromise<v2AddPubkeySvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts/{svcAccountId}/pubkey',
            path: {
                'svcAccountId': svcAccountId,
            },
            body: body,
        });
    }
    /**
     * CreateS3CredentialsSvcAccount
     * Status: ALPHA
     *
     * Creates or updates S3 credentials for a specific SvcAccount and data_proxy
     * @param svcAccountId
     * @param endpointId
     * @returns v2CreateS3CredentialsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceCreateS3CredentialsSvcAccount(
        svcAccountId: string,
        endpointId: string,
    ): CancelablePromise<v2CreateS3CredentialsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/service_accounts/{svcAccountId}/s3_credentials/{endpointId}',
            path: {
                'svcAccountId': svcAccountId,
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
    /**
     * RemoveTrustedEndpointsSvcAccount
     * Status: ALPHA
     *
     * Removes an endpoint from the trusted endpoints list of the SvcAccount
     * @param svcAccountId
     * @param endpointId
     * @returns v2RemoveTrustedEndpointsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceRemoveTrustedEndpointsSvcAccount(
        svcAccountId: string,
        endpointId?: string,
    ): CancelablePromise<v2RemoveTrustedEndpointsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/service_accounts/{svcAccountId}/trusted_endpoints',
            path: {
                'svcAccountId': svcAccountId,
            },
            query: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * AddTrustedEndpointsSvcAccount
     * Status: ALPHA
     *
     * Adds an endpoint to the trusted endpoints list of the SvcAccount
     * @param svcAccountId
     * @param body
     * @returns v2AddTrustedEndpointsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceAddTrustedEndpointsSvcAccount(
        svcAccountId: string,
        body: {
            endpointId?: string;
        },
    ): CancelablePromise<v2AddTrustedEndpointsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/service_accounts/{svcAccountId}/trusted_endpoints',
            path: {
                'svcAccountId': svcAccountId,
            },
            body: body,
        });
    }
    /**
     * GetS3CredentialsSvcAccount
     * Status: ALPHA
     *
     * Gets S3 credentials for a specific svc_account and data_proxy
     * @param svcAccountId If called as admin, an id must be provided
     * @param endpointId
     * @returns v2GetS3CredentialsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceGetS3CredentialsSvcAccount(
        svcAccountId: string,
        endpointId: string,
    ): CancelablePromise<v2GetS3CredentialsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/s3_credentials/{svcAccountId}/s3_credentials/{endpointId}',
            path: {
                'svcAccountId': svcAccountId,
                'endpointId': endpointId,
            },
        });
    }
    /**
     * DeleteS3CredentialsSvcAccount
     * Status: ALPHA
     *
     * Revokes existing S3 credentials for a specific user and data_proxy
     * @param svcAccountId
     * @param endpointId
     * @param body
     * @returns v2DeleteS3CredentialsSvcAccountResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static serviceAccountServiceDeleteS3CredentialsSvcAccount(
        svcAccountId: string,
        endpointId: string,
        body: any,
    ): CancelablePromise<v2DeleteS3CredentialsSvcAccountResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/s3_credentials/{svcAccountId}/s3_credentials/{endpointId}/revoke',
            path: {
                'svcAccountId': svcAccountId,
                'endpointId': endpointId,
            },
            body: body,
        });
    }
}
