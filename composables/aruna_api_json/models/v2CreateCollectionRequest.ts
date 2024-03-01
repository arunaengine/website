/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2DataClass } from './v2DataClass';
import type { v2KeyValue } from './v2KeyValue';
import type { v2Relation } from './v2Relation';
export type v2CreateCollectionRequest = {
    name?: string;
    description?: string;
    keyValues?: Array<v2KeyValue>;
    relations?: Array<v2Relation>;
    dataClass?: v2DataClass;
    projectId?: string;
    metadataLicenseTag?: string;
    defaultDataLicenseTag?: string;
};

