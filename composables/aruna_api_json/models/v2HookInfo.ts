/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Hook } from './v2Hook';
import type { v2Trigger } from './v2Trigger';
export type v2HookInfo = {
    hookId?: string;
    projectIds?: Array<string>;
    name?: string;
    description?: string;
    hook?: v2Hook;
    trigger?: v2Trigger;
    timeout?: string;
};

