/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2EndpointHostConfig } from './v2EndpointHostConfig';
import type { v2EndpointVariant } from './v2EndpointVariant';
export type v2CreateEndpointRequest = {
    name?: string;
    epVariant?: v2EndpointVariant;
    isPublic?: boolean;
    pubkey?: string;
    hostConfigs?: Array<v2EndpointHostConfig>;
};

