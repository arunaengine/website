/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2AcknowledgePersonalNotificationsRequest } from '../models/v2AcknowledgePersonalNotificationsRequest';
import type { v2AcknowledgePersonalNotificationsResponse } from '../models/v2AcknowledgePersonalNotificationsResponse';
import type { v2ActivateUserResponse } from '../models/v2ActivateUserResponse';
import type { v2AddDataProxyAttributeUserResponse } from '../models/v2AddDataProxyAttributeUserResponse';
import type { v2AddOidcProviderRequest } from '../models/v2AddOidcProviderRequest';
import type { v2AddOidcProviderResponse } from '../models/v2AddOidcProviderResponse';
import type { v2AddPubkeyUserRequest } from '../models/v2AddPubkeyUserRequest';
import type { v2AddPubkeyUserResponse } from '../models/v2AddPubkeyUserResponse';
import type { v2AddTrustedEndpointsUserRequest } from '../models/v2AddTrustedEndpointsUserRequest';
import type { v2AddTrustedEndpointsUserResponse } from '../models/v2AddTrustedEndpointsUserResponse';
import type { v2CreateAPITokenRequest } from '../models/v2CreateAPITokenRequest';
import type { v2CreateAPITokenResponse } from '../models/v2CreateAPITokenResponse';
import type { v2CreateS3CredentialsUserTokenResponse } from '../models/v2CreateS3CredentialsUserTokenResponse';
import type { v2DataProxyAttribute } from '../models/v2DataProxyAttribute';
import type { v2DeactivateUserResponse } from '../models/v2DeactivateUserResponse';
import type { v2DeleteAPITokenResponse } from '../models/v2DeleteAPITokenResponse';
import type { v2DeleteAPITokensResponse } from '../models/v2DeleteAPITokensResponse';
import type { v2DeleteS3CredentialsUserResponse } from '../models/v2DeleteS3CredentialsUserResponse';
import type { v2GetAllUsersResponse } from '../models/v2GetAllUsersResponse';
import type { v2GetAPITokenResponse } from '../models/v2GetAPITokenResponse';
import type { v2GetAPITokensResponse } from '../models/v2GetAPITokensResponse';
import type { v2GetDataproxyTokenUserResponse } from '../models/v2GetDataproxyTokenUserResponse';
import type { v2GetNotActivatedUsersResponse } from '../models/v2GetNotActivatedUsersResponse';
import type { v2GetPersonalNotificationsResponse } from '../models/v2GetPersonalNotificationsResponse';
import type { v2GetS3CredentialsUserTokenResponse } from '../models/v2GetS3CredentialsUserTokenResponse';
import type { v2GetUserRedactedResponse } from '../models/v2GetUserRedactedResponse';
import type { v2GetUserResponse } from '../models/v2GetUserResponse';
import type { v2RegisterUserRequest } from '../models/v2RegisterUserRequest';
import type { v2RegisterUserResponse } from '../models/v2RegisterUserResponse';
import type { v2RemoveDataProxyAttributeUserResponse } from '../models/v2RemoveDataProxyAttributeUserResponse';
import type { v2RemoveOidcProviderRequest } from '../models/v2RemoveOidcProviderRequest';
import type { v2RemoveOidcProviderResponse } from '../models/v2RemoveOidcProviderResponse';
import type { v2RemoveTrustedEndpointsUserResponse } from '../models/v2RemoveTrustedEndpointsUserResponse';
import type { v2UpdateUserDisplayNameRequest } from '../models/v2UpdateUserDisplayNameRequest';
import type { v2UpdateUserDisplayNameResponse } from '../models/v2UpdateUserDisplayNameResponse';
import type { v2UpdateUserEmailRequest } from '../models/v2UpdateUserEmailRequest';
import type { v2UpdateUserEmailResponse } from '../models/v2UpdateUserEmailResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UserServiceService {
    /**
     * GetUserRequest
     * Status: STABLE
     *
     * This is a request that returns the user information of the
     * current user or if invoked by an admin from another user
     * @param userId Optional user_id
     * @returns v2GetUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetUser(
        userId?: string,
    ): CancelablePromise<v2GetUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user',
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * AddOidcProvider
     * Status: BETA
     *
     * Add alternative oidc login method for user
     * @param body
     * @returns v2AddOidcProviderResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceAddOidcProvider(
        body: v2AddOidcProviderRequest,
    ): CancelablePromise<v2AddOidcProviderResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/add_oidc',
            body: body,
        });
    }
    /**
     * UpdateUserDisplayName
     * Status: STABLE
     *
     * Updates the Displayname for the user (Personal only)
     * @param body
     * @returns v2UpdateUserDisplayNameResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceUpdateUserDisplayName(
        body: v2UpdateUserDisplayNameRequest,
    ): CancelablePromise<v2UpdateUserDisplayNameResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/display_name',
            body: body,
        });
    }
    /**
     * UpdateUserDisplayName
     * Status: ALPHA
     *
     * Updates the email for the user (Personal only)
     * @param body
     * @returns v2UpdateUserEmailResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceUpdateUserEmail(
        body: v2UpdateUserEmailRequest,
    ): CancelablePromise<v2UpdateUserEmailResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/email',
            body: body,
        });
    }
    /**
     * GetAllUsers
     * Status: ALPHA
     *
     * Get all users including permissions (Admin only)
     * @returns v2GetAllUsersResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetAllUsers(): CancelablePromise<v2GetAllUsersResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/list',
        });
    }
    /**
     * GetNotActivatedUsers
     * Status: STABLE
     *
     * Get all not activated users (Admin only)
     * @returns v2GetNotActivatedUsersResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetNotActivatedUsers(): CancelablePromise<v2GetNotActivatedUsersResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/list/not_activated',
        });
    }
    /**
     * GetPersonalNotifications
     * Status: ALPHA
     *
     * Fetches personal notifications
     * @returns v2GetPersonalNotificationsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetPersonalNotifications(): CancelablePromise<v2GetPersonalNotificationsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/notifications',
        });
    }
    /**
     * AcknowledgePersonalNotifications
     * Status: ALPHA
     *
     * Acknowledges personal notifications
     * @param body
     * @returns v2AcknowledgePersonalNotificationsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceAcknowledgePersonalNotifications(
        body: v2AcknowledgePersonalNotificationsRequest,
    ): CancelablePromise<v2AcknowledgePersonalNotificationsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/user/notifications/acknowledge',
            body: body,
        });
    }
    /**
     * GetDataproxyToken
     * Status: ALPHA
     *
     * Gets token for a specific user and data_proxy
     * @param userId
     * @param endpointId
     * @param contextS3Credentials
     * @param contextCopyResource
     * @param contextCopyTargetEndpoint
     * @param contextCopyPush
     * @returns v2GetDataproxyTokenUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetDataproxyTokenUser(
        userId?: string,
        endpointId?: string,
        contextS3Credentials?: boolean,
        contextCopyResource?: string,
        contextCopyTargetEndpoint?: string,
        contextCopyPush?: boolean,
    ): CancelablePromise<v2GetDataproxyTokenUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/proxy_token',
            query: {
                'userId': userId,
                'endpointId': endpointId,
                'context.s3Credentials': contextS3Credentials,
                'context.copy.resource': contextCopyResource,
                'context.copy.targetEndpoint': contextCopyTargetEndpoint,
                'context.copy.push': contextCopyPush,
            },
        });
    }
    /**
     * AddPubkeyUser
     * Status: ALPHA
     *
     * Adds an ED25519 public key for the user
     * @param body
     * @returns v2AddPubkeyUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceAddPubkeyUser(
        body: v2AddPubkeyUserRequest,
    ): CancelablePromise<v2AddPubkeyUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/pubkey',
            body: body,
        });
    }
    /**
     * RegisterUser
     * Status: BETA
     *
     * This request should be called when a new user logs in for the first time
     * @param body
     * @returns v2RegisterUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceRegisterUser(
        body: v2RegisterUserRequest,
    ): CancelablePromise<v2RegisterUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/user/register',
            body: body,
        });
    }
    /**
     * RemoveOidcProvider
     * Status: BETA
     *
     * Remove alternative oidc login method from user
     * (Only works if user has more than one oidc provider)
     * @param body
     * @returns v2RemoveOidcProviderResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceRemoveOidcProvider(
        body: v2RemoveOidcProviderRequest,
    ): CancelablePromise<v2RemoveOidcProviderResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/remove_oidc',
            body: body,
        });
    }
    /**
     * GetS3CredentialsUserToken
     * Status: ALPHA
     *
     * Gets S3 credentials for a specific token and data_proxy
     * @param endpointId
     * @returns v2GetS3CredentialsUserTokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetS3CredentialsUserToken(
        endpointId: string,
    ): CancelablePromise<v2GetS3CredentialsUserTokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/s3_credentials/{endpointId}',
            path: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * CreateS3CredentialsUserToken
     * Status: ALPHA
     *
     * Creates or updates S3 credentials for a specific user and data_proxy
     * @param endpointId
     * @returns v2CreateS3CredentialsUserTokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceCreateS3CredentialsUserToken(
        endpointId: string,
    ): CancelablePromise<v2CreateS3CredentialsUserTokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/s3_credentials/{endpointId}',
            path: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * DeleteS3CredentialsUserToken
     * Status: ALPHA
     *
     * Revokes existing S3 credentials for a specific user and data_proxy
     * @param endpointId
     * @param body
     * @returns v2DeleteS3CredentialsUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceDeleteS3CredentialsUserToken(
        endpointId: string,
        body: any,
    ): CancelablePromise<v2DeleteS3CredentialsUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/s3_credentials/{endpointId}/revoke',
            path: {
                'endpointId': endpointId,
            },
            body: body,
        });
    }
    /**
     * GetAPITokens
     * Status: STABLE
     *
     * Returns a list of API tokens for a specific user
     * @returns v2GetAPITokensResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetApiTokens(): CancelablePromise<v2GetAPITokensResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/tokens',
        });
    }
    /**
     * DeleteAPITokens
     * Status: BETA
     *
     * Deletes the specified API Token
     * @param userId This request invalidates all tokens of a specific user
     * usually the user_id is specified via the provided oidc or aruna token
     * This user_id can be used by admins to invalidate all tokens of a specific
     * user
     * @returns v2DeleteAPITokensResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceDeleteApiTokens(
        userId?: string,
    ): CancelablePromise<v2DeleteAPITokensResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/user/tokens',
            query: {
                'userId': userId,
            },
        });
    }
    /**
     * CreateAPIToken
     * Status: BETA
     *
     * Creates an API token to authenticate
     * @param body
     * @returns v2CreateAPITokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceCreateApiToken(
        body: v2CreateAPITokenRequest,
    ): CancelablePromise<v2CreateAPITokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/user/tokens',
            body: body,
        });
    }
    /**
     * GetAPIToken
     * Status: BETA
     *
     * Returns one API token by id
     * @param tokenId The token id
     * @returns v2GetAPITokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetApiToken(
        tokenId: string,
    ): CancelablePromise<v2GetAPITokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/tokens/{tokenId}',
            path: {
                'tokenId': tokenId,
            },
        });
    }
    /**
     * DeleteAPIToken
     * Status: STABLE
     *
     * Deletes the specified API Token
     * @param tokenId The token_id
     * @returns v2DeleteAPITokenResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceDeleteApiToken(
        tokenId: string,
    ): CancelablePromise<v2DeleteAPITokenResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/user/tokens/{tokenId}',
            path: {
                'tokenId': tokenId,
            },
        });
    }
    /**
     * RemoveTrustedEndpointsUser
     * Status: ALPHA
     *
     * Removes an endpoint from the trusted endpoints list of the user
     * @param endpointId
     * @returns v2RemoveTrustedEndpointsUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceRemoveTrustedEndpointsUser(
        endpointId?: string,
    ): CancelablePromise<v2RemoveTrustedEndpointsUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/user/trusted_endpoints',
            query: {
                'endpointId': endpointId,
            },
        });
    }
    /**
     * AddTrustedEndpointsUser
     * Status: ALPHA
     *
     * Adds an endpoint to the trusted endpoints list of the user
     * @param body
     * @returns v2AddTrustedEndpointsUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceAddTrustedEndpointsUser(
        body: v2AddTrustedEndpointsUserRequest,
    ): CancelablePromise<v2AddTrustedEndpointsUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/trusted_endpoints',
            body: body,
        });
    }
    /**
     * ActivateUser
     * Status: BETA
     *
     * This activates a specific user (Admin request)
     * @param userId User to activate
     * @param body
     * @returns v2ActivateUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceActivateUser(
        userId: string,
        body: any,
    ): CancelablePromise<v2ActivateUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/{userId}/activate',
            path: {
                'userId': userId,
            },
            body: body,
        });
    }
    /**
     * RemoveDataProxyAttributeUser
     * Status: ALPHA
     *
     * Removes an data proxy specific attribute from the user
     * @param userId
     * @param dataproxyId
     * @param attributeName
     * @returns v2RemoveDataProxyAttributeUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceRemoveDataProxyAttributeUser(
        userId: string,
        dataproxyId?: string,
        attributeName?: string,
    ): CancelablePromise<v2RemoveDataProxyAttributeUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/user/{userId}/attributes/data_proxy',
            path: {
                'userId': userId,
            },
            query: {
                'dataproxyId': dataproxyId,
                'attributeName': attributeName,
            },
        });
    }
    /**
     * AddDataProxyAttributeUser
     * Status: ALPHA
     *
     * Adds an data proxy specific attribute to the user
     * @param userId
     * @param body
     * @returns v2AddDataProxyAttributeUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceAddDataProxyAttributeUser(
        userId: string,
        body: {
            attribute?: v2DataProxyAttribute;
        },
    ): CancelablePromise<v2AddDataProxyAttributeUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/{userId}/attributes/data_proxy',
            path: {
                'userId': userId,
            },
            body: body,
        });
    }
    /**
     * DeActivateUser
     * Status: BETA
     *
     * This deactivates a specific user (Admin request)
     * @param userId User to activate
     * @param body
     * @returns v2DeactivateUserResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceDeactivateUser(
        userId: string,
        body: any,
    ): CancelablePromise<v2DeactivateUserResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/user/{userId}/deactivate',
            path: {
                'userId': userId,
            },
            body: body,
        });
    }
    /**
     * GetUserRequestRedacted
     * Status: STABLE
     *
     * This is a request that returns the user information of the
     * current user or if invoked by an admin from another user
     * Redacts personal information like name or email
     * @param userId Optional user_id
     * @returns v2GetUserRedactedResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static userServiceGetUserRedacted(
        userId: string,
    ): CancelablePromise<v2GetUserRedactedResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/user/{userId}/redacted',
            path: {
                'userId': userId,
            },
        });
    }
}
