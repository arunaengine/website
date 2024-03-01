/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { modelsv2Status } from './modelsv2Status';
import type { v2DataClass } from './v2DataClass';
import type { v2DataEndpoint } from './v2DataEndpoint';
import type { v2Hash } from './v2Hash';
import type { v2KeyValue } from './v2KeyValue';
import type { v2Relation } from './v2Relation';
export type v2Object = {
    id?: string;
    name?: string;
    description?: string;
    keyValues?: Array<v2KeyValue>;
    relations?: Array<v2Relation>;
    contentLen?: string;
    dataClass?: v2DataClass;
    createdAt?: string;
    createdBy?: string;
    status?: modelsv2Status;
    dynamic?: boolean;
    endpoints?: Array<v2DataEndpoint>;
    hashes?: Array<v2Hash>;
    metadataLicenseTag?: string;
    dataLicenseTag?: string;
};

