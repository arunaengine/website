/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Author } from './v2Author';
import type { v2DataClass } from './v2DataClass';
import type { v2Hash } from './v2Hash';
import type { v2KeyValue } from './v2KeyValue';
import type { v2Relation } from './v2Relation';
/**
 * Models
 * These are the models for the above described requests and responses.
 * gRPC best practises advice each Request and Response message in a RPC to be
 * called {rpc_name}Request and {rpc_name}Response.
 */
export type v2CreateObjectRequest = {
    name?: string;
    title?: string;
    description?: string;
    keyValues?: Array<v2KeyValue>;
    relations?: Array<v2Relation>;
    dataClass?: v2DataClass;
    projectId?: string;
    collectionId?: string;
    datasetId?: string;
    hashes?: Array<v2Hash>;
    metadataLicenseTag?: string;
    dataLicenseTag?: string;
    authors?: Array<v2Author>;
};

