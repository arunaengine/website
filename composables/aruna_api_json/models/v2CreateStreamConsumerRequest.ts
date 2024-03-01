/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2ResourceTarget } from './v2ResourceTarget';
import type { v2StreamAll } from './v2StreamAll';
import type { v2StreamFromDate } from './v2StreamFromDate';
import type { v2StreamFromSequence } from './v2StreamFromSequence';
export type v2CreateStreamConsumerRequest = {
    resource?: v2ResourceTarget;
    user?: string;
    announcements?: boolean;
    all?: boolean;
    includeSubresources?: boolean;
    streamAll?: v2StreamAll;
    streamFromDate?: v2StreamFromDate;
    streamFromSequence?: v2StreamFromSequence;
};

