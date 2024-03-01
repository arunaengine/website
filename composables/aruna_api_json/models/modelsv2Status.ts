/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * - STATUS_UNSPECIFIED: Unspecified
 * - STATUS_INITIALIZING: This object is initializing -> Staging
 * - STATUS_VALIDATING: Data got uploaded and a validating hook got triggered
 * - STATUS_AVAILABLE: Data is available
 * - STATUS_UNAVAILABLE: Data is temporarily not available
 * - STATUS_ERROR: Validating failed or fatal error in data proxy
 * - STATUS_DELETED: Object got deleted
 */
export enum modelsv2Status {
    STATUS_UNSPECIFIED = 'STATUS_UNSPECIFIED',
    STATUS_INITIALIZING = 'STATUS_INITIALIZING',
    STATUS_VALIDATING = 'STATUS_VALIDATING',
    STATUS_AVAILABLE = 'STATUS_AVAILABLE',
    STATUS_UNAVAILABLE = 'STATUS_UNAVAILABLE',
    STATUS_ERROR = 'STATUS_ERROR',
    STATUS_DELETED = 'STATUS_DELETED',
}
