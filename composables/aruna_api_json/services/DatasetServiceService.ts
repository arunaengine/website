/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2Author } from '../models/v2Author';
import type { v2CreateDatasetRequest } from '../models/v2CreateDatasetRequest';
import type { v2CreateDatasetResponse } from '../models/v2CreateDatasetResponse';
import type { v2DataClass } from '../models/v2DataClass';
import type { v2DeleteDatasetResponse } from '../models/v2DeleteDatasetResponse';
import type { v2GetDatasetResponse } from '../models/v2GetDatasetResponse';
import type { v2GetDatasetsResponse } from '../models/v2GetDatasetsResponse';
import type { v2KeyValue } from '../models/v2KeyValue';
import type { v2SnapshotDatasetResponse } from '../models/v2SnapshotDatasetResponse';
import type { v2UpdateDatasetAuthorsResponse } from '../models/v2UpdateDatasetAuthorsResponse';
import type { v2UpdateDatasetDataClassResponse } from '../models/v2UpdateDatasetDataClassResponse';
import type { v2UpdateDatasetDescriptionResponse } from '../models/v2UpdateDatasetDescriptionResponse';
import type { v2UpdateDatasetKeyValuesResponse } from '../models/v2UpdateDatasetKeyValuesResponse';
import type { v2UpdateDatasetLicensesResponse } from '../models/v2UpdateDatasetLicensesResponse';
import type { v2UpdateDatasetNameResponse } from '../models/v2UpdateDatasetNameResponse';
import type { v2UpdateDatasetTitleResponse } from '../models/v2UpdateDatasetTitleResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DatasetServiceService {
    /**
     * UpdateAuthors
     * Status: ALPHA
     *
     * Updates the datasets metadata title.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetAuthorsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetAuthors(
        datasetId: string,
        body: {
            addAuthors?: Array<v2Author>;
            removeAuthors?: Array<v2Author>;
        },
    ): CancelablePromise<v2UpdateDatasetAuthorsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/dataset/{datasetId}/authors',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * GetDatasets
     * Status: BETA
     *
     * Queries multiple datasets by ID
     * @param datasetIds
     * @returns v2GetDatasetsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceGetDatasets(
        datasetIds?: Array<string>,
    ): CancelablePromise<v2GetDatasetsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/datasets',
            query: {
                'datasetIds': datasetIds,
            },
        });
    }
    /**
     * CreateNewDataset
     * Status: BETA
     *
     * creates a new Dataset
     * @param body
     * @returns v2CreateDatasetResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceCreateDataset(
        body: v2CreateDatasetRequest,
    ): CancelablePromise<v2CreateDatasetResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/datasets',
            body: body,
        });
    }
    /**
     * GetDataset
     * Status: BETA
     *
     * Request a specific dataset by ID
     * @param datasetId Requested id
     * @returns v2GetDatasetResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceGetDataset(
        datasetId: string,
    ): CancelablePromise<v2GetDatasetResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/datasets/{datasetId}',
            path: {
                'datasetId': datasetId,
            },
        });
    }
    /**
     * DeleteDataset
     * Status: STABLE
     *
     * This request deletes the dataset.
     * @param datasetId
     * @returns v2DeleteDatasetResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceDeleteDataset(
        datasetId: string,
    ): CancelablePromise<v2DeleteDatasetResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/datasets/{datasetId}',
            path: {
                'datasetId': datasetId,
            },
        });
    }
    /**
     * UpdateDatasetDataClass
     * Status: BETA
     *
     * Updates the dataset name. All (meta) data will be overwritten.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetDataClassResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetDataClass(
        datasetId: string,
        body: {
            dataClass?: v2DataClass;
        },
    ): CancelablePromise<v2UpdateDatasetDataClassResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/data_class',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * UpdateDatasetDescription
     * Status: BETA
     *
     * Updates the dataset description.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetDescriptionResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetDescription(
        datasetId: string,
        body: {
            description?: string;
        },
    ): CancelablePromise<v2UpdateDatasetDescriptionResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/description',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * UpdateDatasetKeyValues
     * Status: BETA
     *
     * Updates the dataset key values.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetKeyValuesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetKeyValues(
        datasetId: string,
        body: {
            addKeyValues?: Array<v2KeyValue>;
            removeKeyValues?: Array<v2KeyValue>;
        },
    ): CancelablePromise<v2UpdateDatasetKeyValuesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/key_values',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * UpdateLicenses
     * Status: BETA
     *
     * Updates the dataset metadata license and/or default data license.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetLicensesResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetLicenses(
        datasetId: string,
        body: {
            metadataLicenseTag?: string;
            defaultDataLicenseTag?: string;
        },
    ): CancelablePromise<v2UpdateDatasetLicensesResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/licenses',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * UpdateDatasetName
     * Status: BETA
     *
     * Updates the dataset name. Caveat! Will rename the "s3 bucket" for data proxies!
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetNameResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetName(
        datasetId: string,
        body: {
            name?: string;
        },
    ): CancelablePromise<v2UpdateDatasetNameResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/name',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * SnapshotDatasetRequest
     * Status: BETA
     *
     * Archives the full dataset, rendering all downstream relations immutable
     * @param datasetId
     * @param body
     * @returns v2SnapshotDatasetResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceSnapshotDataset(
        datasetId: string,
        body: any,
    ): CancelablePromise<v2SnapshotDatasetResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/datasets/{datasetId}/snapshot',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
    /**
     * UpdateTitle
     * Status: ALPHA
     *
     * Updates the datasets metadata title.
     * @param datasetId
     * @param body
     * @returns v2UpdateDatasetTitleResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static datasetServiceUpdateDatasetTitle(
        datasetId: string,
        body: {
            title?: string;
        },
    ): CancelablePromise<v2UpdateDatasetTitleResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/datasets/{datasetId}/title',
            path: {
                'datasetId': datasetId,
            },
            body: body,
        });
    }
}
