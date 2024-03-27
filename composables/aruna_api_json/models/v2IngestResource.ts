/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Author } from './v2Author';
import type { v2DataClass } from './v2DataClass';
import type { v2Hash } from './v2Hash';
import type { v2KeyValue } from './v2KeyValue';
import type { v2Relation } from './v2Relation';
export type v2IngestResource = {
    name?: string;
    title?: string;
    description?: string;
    authors?: Array<v2Author>;
    keyValues?: Array<v2KeyValue>;
    relations?: Array<v2Relation>;
    dataClass?: v2DataClass;
    hashes?: Array<v2Hash>;
    metadataLicenseTag?: string;
    dataLicenseTag?: string;
};

