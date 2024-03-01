/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { apistorageservicesv2CompletedPart } from '../models/apistorageservicesv2CompletedPart';
import type { apistorageservicesv2DeleteObjectResponse } from '../models/apistorageservicesv2DeleteObjectResponse';
import type { apistorageservicesv2GetObjectResponse } from '../models/apistorageservicesv2GetObjectResponse';
import type { googlerpcStatus } from '../models/googlerpcStatus';
import type { v2CloneObjectResponse } from '../models/v2CloneObjectResponse';
import type { v2CreateObjectRequest } from '../models/v2CreateObjectRequest';
import type { v2CreateObjectResponse } from '../models/v2CreateObjectResponse';
import type { v2DataClass } from '../models/v2DataClass';
import type { v2FinishObjectStagingResponse } from '../models/v2FinishObjectStagingResponse';
import type { v2GetDownloadURLResponse } from '../models/v2GetDownloadURLResponse';
import type { v2GetObjectsResponse } from '../models/v2GetObjectsResponse';
import type { v2GetUploadURLResponse } from '../models/v2GetUploadURLResponse';
import type { v2Hash } from '../models/v2Hash';
import type { v2KeyValue } from '../models/v2KeyValue';
import type { v2UpdateObjectResponse } from '../models/v2UpdateObjectResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ObjectServiceService {
    /**
     * GetObjects
     * Status: BETA
     *
     * Get multiple objects by ID at once
     * @param objectIds Object ids
     * @returns v2GetObjectsResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceGetObjects(
        objectIds?: Array<string>,
    ): CancelablePromise<v2GetObjectsResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/objects',
            query: {
                'objectIds': objectIds,
            },
        });
    }
    /**
     * CreateObject
     * Status: BETA
     *
     * This creates a new object and puts it in a staging area.
     * Staging objects have an "INITIALIZING" status
     * and need to be finished either manually or by uploading data.
     * @param body Models
     * These are the models for the above described requests and responses.
     * gRPC best practises advice each Request and Response message in a RPC to be
     * called {rpc_name}Request and {rpc_name}Response.
     * @returns v2CreateObjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceCreateObject(
        body: v2CreateObjectRequest,
    ): CancelablePromise<v2CreateObjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/objects',
            body: body,
        });
    }
    /**
     * GetObject
     * Status: BETA
     *
     * gets a specific Object by ID that is associated to the
     * current collection By default only the latest revision of an object will be
     * returned Specify a revision_number to select an older revision With the
     * optional with_url boolean a download link can automatically be requested
     * @param objectId Object Id
     * @returns apistorageservicesv2GetObjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceGetObject(
        objectId: string,
    ): CancelablePromise<apistorageservicesv2GetObjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/objects/{objectId}',
            path: {
                'objectId': objectId,
            },
        });
    }
    /**
     * DeleteObject
     * Status: BETA
     *
     * Deletes the object with the complete revision history.
     * @param objectId ObjectId
     * @param body
     * @returns apistorageservicesv2DeleteObjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceDeleteObject(
        objectId: string,
        body: {
            withRevisions?: boolean;
        },
    ): CancelablePromise<apistorageservicesv2DeleteObjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/v2/objects/{objectId}',
            path: {
                'objectId': objectId,
            },
            body: body,
        });
    }
    /**
     * UpdateObject
     * Status: BETA
     *
     * Objects are immutable!
     * Updating an object will create a new revision for the object
     * This method will put the new revision in a staging area.
     * Staged objects will get a separate staging id and need to be finished
     * before they can be used.
     * @param objectId Existing object ID
     * @param body
     * @returns v2UpdateObjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceUpdateObject(
        objectId: string,
        body: {
            name?: string;
            description?: string;
            addKeyValues?: Array<v2KeyValue>;
            removeKeyValues?: Array<v2KeyValue>;
            dataClass?: v2DataClass;
            projectId?: string;
            collectionId?: string;
            datasetId?: string;
            hashes?: Array<v2Hash>;
            forceRevision?: boolean;
            metadataLicenseTag?: string;
            dataLicenseTag?: string;
        },
    ): CancelablePromise<v2UpdateObjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/objects/{objectId}',
            path: {
                'objectId': objectId,
            },
            body: body,
        });
    }
    /**
     * GetDownloadUrl
     * Status: BETA
     *
     * This is a proxy method that will call the apropriate method at dataproxy level
     * will return a url that can be used to download a file from S3.
     * @param objectId
     * @returns v2GetDownloadURLResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceGetDownloadUrl(
        objectId: string,
    ): CancelablePromise<v2GetDownloadURLResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/objects/{objectId}/download',
            path: {
                'objectId': objectId,
            },
        });
    }
    /**
     * FinishObjectStaging
     * Status: BETA
     *
     * This method completes the staging of an object.
     * @param objectId ObjectId
     * @param body
     * @returns v2FinishObjectStagingResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceFinishObjectStaging(
        objectId: string,
        body: {
            contentLen?: string;
            /**
             * Hash of the uploaded data - used to verify the data integrity.
             * This supports multiple hashing algorithms.
             */
            hashes?: Array<v2Hash>;
            completedParts?: Array<apistorageservicesv2CompletedPart>;
        },
    ): CancelablePromise<v2FinishObjectStagingResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/v2/objects/{objectId}/finish',
            path: {
                'objectId': objectId,
            },
            body: body,
        });
    }
    /**
     * GetUploadURL
     * Status: BETA
     *
     * This is a proxy method that will call the apropriate method at dataproxy level
     * This method will return a (multi-part) url that can be used to upload a
     * file to S3. Part is a optional query parameter that can be used to upload a
     * part of the file / multipart upload.
     * @param objectId ObjectId
     * @param multipart Is this a multipart upload?
     * @param partNumber (optional) if multi was initialized
     * @returns v2GetUploadURLResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceGetUploadUrl(
        objectId: string,
        multipart?: boolean,
        partNumber?: number,
    ): CancelablePromise<v2GetUploadURLResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/v2/objects/{objectId}/upload',
            path: {
                'objectId': objectId,
            },
            query: {
                'multipart': multipart,
                'partNumber': partNumber,
            },
        });
    }
    /**
     * CloneObject
     * Status: BETA
     *
     * This method clones an object and creates a copy in the same collection.
     * This copy has a new id and revision and will not receive any updates from
     * the original object.
     * @param objectId ObjectId
     * @param body
     * @returns v2CloneObjectResponse A successful response.
     * @returns googlerpcStatus An unexpected error response.
     * @throws ApiError
     */
    public static objectServiceCloneObject(
        objectId: string,
        body: {
            projectId?: string;
            collectionId?: string;
            datasetId?: string;
        },
    ): CancelablePromise<v2CloneObjectResponse | googlerpcStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/v2/{objectId}/clone',
            path: {
                'objectId': objectId,
            },
            body: body,
        });
    }
}
