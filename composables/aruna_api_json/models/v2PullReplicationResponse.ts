/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2Chunk } from './v2Chunk';
import type { v2Empty } from './v2Empty';
import type { v2Handshake } from './v2Handshake';
import type { v2ObjectInfo } from './v2ObjectInfo';
import type { v2Skip } from './v2Skip';
export type v2PullReplicationResponse = {
    handshake?: v2Handshake;
    objectInfo?: v2ObjectInfo;
    chunk?: v2Chunk;
    finishMessage?: v2Empty;
    skip?: v2Skip;
};

