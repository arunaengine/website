/* generated using openapi-typescript-codegen -- do no edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { v2InternalRelationVariant } from './v2InternalRelationVariant';
import type { v2RelationDirection } from './v2RelationDirection';
import type { v2ResourceVariant } from './v2ResourceVariant';
export type v2InternalRelation = {
    resourceId?: string;
    resourceVariant?: v2ResourceVariant;
    definedVariant?: v2InternalRelationVariant;
    customVariant?: string;
    direction?: v2RelationDirection;
};

