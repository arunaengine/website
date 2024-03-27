/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { modelsv2Status } from './modelsv2Status';
import type { v2Author } from './v2Author';
import type { v2DataClass } from './v2DataClass';
import type { v2DataEndpoint } from './v2DataEndpoint';
import type { v2KeyValue } from './v2KeyValue';
import type { v2Relation } from './v2Relation';
import type { v2RuleBinding } from './v2RuleBinding';
import type { v2Stats } from './v2Stats';
export type v2Dataset = {
    id?: string;
    name?: string;
    title?: string;
    description?: string;
    keyValues?: Array<v2KeyValue>;
    relations?: Array<v2Relation>;
    stats?: v2Stats;
    dataClass?: v2DataClass;
    createdAt?: string;
    createdBy?: string;
    authors?: Array<v2Author>;
    status?: modelsv2Status;
    dynamic?: boolean;
    endpoints?: Array<v2DataEndpoint>;
    metadataLicenseTag?: string;
    defaultDataLicenseTag?: string;
    ruleBindings?: Array<v2RuleBinding>;
};

