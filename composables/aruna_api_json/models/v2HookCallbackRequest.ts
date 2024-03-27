/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Error } from './v2Error';
import type { v2Finished } from './v2Finished';
export type v2HookCallbackRequest = {
    finished?: v2Finished;
    error?: v2Error;
    secret?: string;
    hookId?: string;
    objectId?: string;
    pubkeySerial?: number;
};

