/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2NewVersion } from './v2NewVersion';
import type { v2Reply } from './v2Reply';
import type { v2ScheduledDowntime } from './v2ScheduledDowntime';
export type v2AnnouncementEvent = {
    newDataProxyId?: string;
    removeDataProxyId?: string;
    updateDataProxyId?: string;
    newPubkey?: number;
    removePubkey?: number;
    downtime?: v2ScheduledDowntime;
    version?: v2NewVersion;
    reply?: v2Reply;
};

