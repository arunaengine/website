/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { storagemodelsv2ReplicationStatus } from './storagemodelsv2ReplicationStatus';
import type { v2FullSync } from './v2FullSync';
export type v2DataEndpoint = {
    id?: string;
    fullSync?: v2FullSync;
    partialSync?: boolean;
    status?: storagemodelsv2ReplicationStatus;
};

