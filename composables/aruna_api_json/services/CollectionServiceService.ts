/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2Author } from '../models/v2Author';
import type { v2CreateCollectionRequest } from '../models/v2CreateCollectionRequest';
import type { v2CreateCollectionResponse } from '../models/v2CreateCollectionResponse';
import type { v2DataClass } from '../models/v2DataClass';
import type { v2DeleteCollectionResponse } from '../models/v2DeleteCollectionResponse';
import type { v2GetCollectionResponse } from '../models/v2GetCollectionResponse';
import type { v2GetCollectionsResponse } from '../models/v2GetCollectionsResponse';
import type { v2KeyValue } from '../models/v2KeyValue';
import type { v2SnapshotCollectionResponse } from '../models/v2SnapshotCollectionResponse';
import type { v2UpdateCollectionAuthorsResponse } from '../models/v2UpdateCollectionAuthorsResponse';
import type { v2UpdateCollectionDataClassResponse } from '../models/v2UpdateCollectionDataClassResponse';
import type { v2UpdateCollectionDescriptionResponse } from '../models/v2UpdateCollectionDescriptionResponse';
import type { v2UpdateCollectionKeyValuesResponse } from '../models/v2UpdateCollectionKeyValuesResponse';
import type { v2UpdateCollectionLicensesResponse } from '../models/v2UpdateCollectionLicensesResponse';
import type { v2UpdateCollectionNameResponse } from '../models/v2UpdateCollectionNameResponse';
import type { v2UpdateCollectionTitleResponse } from '../models/v2UpdateCollectionTitleResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CollectionServiceService {
    /**
     * GetCollections
     * Status: BETA
     *
     * Queries multiple collections by ID
     * @param collectionIds
     * @returns v2GetCollectionsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceGetCollections(
        collectionIds?: Array<string>,
    ): CancelablePromise<v2GetCollectionsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/collections',
            query: {
                'collectionIds': collectionIds,
            },
        });
    }
    /**
     * CreateNewCollection
     * Status: BETA
     *
     * creates a new Collection
     * @param body
     * @returns v2CreateCollectionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceCreateCollection(
        body: v2CreateCollectionRequest,
    ): CancelablePromise<v2CreateCollectionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/collections',
            body: body,
        });
    }
    /**
     * GetCollection
     * Status: BETA
     *
     * Request a specific collection by ID
     * @param collectionId Requested id
     * @returns v2GetCollectionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceGetCollection(
        collectionId: string,
    ): CancelablePromise<v2GetCollectionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/collections/{collectionId}',
            path: {
                'collectionId': collectionId,
            },
        });
    }
    /**
     * DeleteCollection
     * Status: STABLE
     *
     * This request deletes the collection.
     * @param collectionId
     * @returns v2DeleteCollectionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceDeleteCollection(
        collectionId: string,
    ): CancelablePromise<v2DeleteCollectionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/collections/{collectionId}',
            path: {
                'collectionId': collectionId,
            },
        });
    }
    /**
     * UpdateAuthors
     * Status: ALPHA
     *
     * Updates the collections metadata title.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionAuthorsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionAuthors(
        collectionId: string,
        body: {
            addAuthors?: Array<v2Author>;
            removeAuthors?: Array<v2Author>;
        },
    ): CancelablePromise<v2UpdateCollectionAuthorsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/authors',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateCollectionDataClass
     * Status: BETA
     *
     * Updates the collection name. All (meta) data will be overwritten.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionDataClassResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionDataClass(
        collectionId: string,
        body: {
            dataClass?: v2DataClass;
        },
    ): CancelablePromise<v2UpdateCollectionDataClassResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/data_class',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateCollectionDescription
     * Status: BETA
     *
     * Updates the collection description.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionDescriptionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionDescription(
        collectionId: string,
        body: {
            description?: string;
        },
    ): CancelablePromise<v2UpdateCollectionDescriptionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/description',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateCollectionKeyValues
     * Status: BETA
     *
     * Updates the collection key values.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionKeyValuesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionKeyValues(
        collectionId: string,
        body: {
            addKeyValues?: Array<v2KeyValue>;
            removeKeyValues?: Array<v2KeyValue>;
        },
    ): CancelablePromise<v2UpdateCollectionKeyValuesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/key_values',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateLicenses
     * Status: BETA
     *
     * Updates the collections metadata license and/or default data license.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionLicensesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionLicenses(
        collectionId: string,
        body: {
            metadataLicenseTag?: string;
            defaultDataLicenseTag?: string;
        },
    ): CancelablePromise<v2UpdateCollectionLicensesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/licenses',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateCollectionName
     * Status: BETA
     *
     * Updates the collection name. Caveat! Will rename the "s3 bucket" for data proxies!
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionNameResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionName(
        collectionId: string,
        body: {
            name?: string;
        },
    ): CancelablePromise<v2UpdateCollectionNameResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/name',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * SnapshotCollectionRequest
     * Status: BETA
     *
     * Archives the full collection, rendering all downstream relations immutable
     * @param collectionId
     * @param body
     * @returns v2SnapshotCollectionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceSnapshotCollection(
        collectionId: string,
        body: any,
    ): CancelablePromise<v2SnapshotCollectionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/collections/{collectionId}/snapshot',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
    /**
     * UpdateTitle
     * Status: ALPHA
     *
     * Updates the collections metadata title.
     * @param collectionId
     * @param body
     * @returns v2UpdateCollectionTitleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static collectionServiceUpdateCollectionTitle(
        collectionId: string,
        body: {
            title?: string;
        },
    ): CancelablePromise<v2UpdateCollectionTitleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/collections/{collectionId}/title',
            path: {
                'collectionId': collectionId,
            },
            body: body,
        });
    }
}
