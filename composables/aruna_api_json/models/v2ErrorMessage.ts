/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Empty } from './v2Empty';
import type { v2RetryChunkMessage } from './v2RetryChunkMessage';
export type v2ErrorMessage = {
    retryChunk?: v2RetryChunkMessage;
    abort?: v2Empty;
    retryObjectId?: string;
};

