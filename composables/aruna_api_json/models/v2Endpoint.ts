/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { storagemodelsv2ComponentStatus } from './storagemodelsv2ComponentStatus';
import type { v2EndpointHostConfig } from './v2EndpointHostConfig';
import type { v2EndpointVariant } from './v2EndpointVariant';
export type v2Endpoint = {
    id?: string;
    epVariant?: v2EndpointVariant;
    name?: string;
    isPublic?: boolean;
    status?: storagemodelsv2ComponentStatus;
    hostConfigs?: Array<v2EndpointHostConfig>;
};

