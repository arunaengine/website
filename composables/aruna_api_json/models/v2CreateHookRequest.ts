/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Hook } from './v2Hook';
import type { v2Trigger } from './v2Trigger';
export type v2CreateHookRequest = {
    name?: string;
    trigger?: v2Trigger;
    hook?: v2Hook;
    timeout?: string;
    projectIds?: Array<string>;
    description?: string;
};

