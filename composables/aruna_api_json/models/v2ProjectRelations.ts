/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2CollectionRelations } from './v2CollectionRelations';
import type { v2DatasetRelations } from './v2DatasetRelations';
export type v2ProjectRelations = {
    origin?: string;
    collectionChildren?: Array<v2CollectionRelations>;
    datasetChildren?: Array<v2DatasetRelations>;
    objectChildren?: Array<string>;
};

