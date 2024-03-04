import { v2ResourceVariant } from './aruna_api_json';
import type { modelsv2Status, v2DataClass, v2GenericResource, v2KeyValue, v2PermissionLevel, v2Relation, v2Stats } from '@/composables/aruna_api_json';

/* Object info conversions */
export type ObjectInfo = {
    id: string,
    name: string,
    variant: v2ResourceVariant,
    description: string,
    key_values: v2KeyValue[],
    stats: v2Stats,
    data_class: v2DataClass,
    created_at: string,
    relations: v2Relation[],
    object_status: modelsv2Status,
    permission: v2PermissionLevel,
    license: string,
    data_license: string,
}

export function toObjectInfo(
    resource: v2GenericResource | undefined,
    permission: v2PermissionLevel | undefined
): ObjectInfo | undefined {
    if (resource === undefined) {
        return undefined
    }

    if (resource.project) {
        return {
            id: resource.project.id,
            name: resource.project.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
            description: resource.project.description,
            key_values: resource.project.keyValues,
            stats: resource.project.stats,
            data_class: resource.project.dataClass,
            created_at: resource.project.createdAt,
            relations: resource.project.relations,
            object_status: resource.project.status,
            permission: permission,
            license: resource.project.metadataLicenseTag,
            data_license: resource.project.defaultDataLicenseTag,
        } as ObjectInfo
    } else if (resource.collection) {
        return {
            id: resource.collection.id,
            name: resource.collection.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_COLLECTION,
            description: resource.collection.description,
            key_values: resource.collection.keyValues,
            stats: resource.collection.stats,
            data_class: resource.collection.dataClass,
            created_at: resource.collection.createdAt,
            relations: resource.collection.relations,
            object_status: resource.collection.status,
            permission: permission,
            license: resource.collection.metadataLicenseTag,
            data_license: resource.collection.defaultDataLicenseTag,
        } as ObjectInfo
    } else if (resource.dataset) {
        return {
            id: resource.dataset.id,
            name: resource.dataset.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_DATASET,
            description: resource.dataset.description,
            key_values: resource.dataset.keyValues,
            stats: resource.dataset.stats,
            data_class: resource.dataset.dataClass,
            created_at: resource.dataset.createdAt,
            relations: resource.dataset.relations,
            object_status: resource.dataset.status,
            permission: permission,
            license: resource.dataset.metadataLicenseTag,
            data_license: resource.dataset.defaultDataLicenseTag,
        } as ObjectInfo
    } else if (resource.object) {
        return {
            id: resource.object.id,
            name: resource.object.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
            description: resource.object.description,
            key_values: resource.object.keyValues,
            stats: {
                size: resource.object.contentLen,
                count: "1",
                lastUpdated: "", // Not provided
            } as v2Stats,
            data_class: resource.object.dataClass,
            created_at: resource.object.createdAt,
            relations: resource.object.relations,
            object_status: resource.object.status,
            permission: permission,
            license: resource.object.metadataLicenseTag,
            data_license: resource.object.dataLicenseTag,
        } as ObjectInfo
    }

    return undefined
}

/*  */
export type SearchResultEntry = {
    id: string,
    name: string,
    variant: v2ResourceVariant,
    description: string,
    key_values: v2KeyValue[],
    stats: v2Stats,
    data_class: v2DataClass,
    created_at: string,
    relations: v2Relation[],
    object_status: modelsv2Status,
}

export function toSearchResult(resource: v2GenericResource | undefined): SearchResultEntry | undefined {
    if (resource === undefined) {
        return undefined
    }

    if (resource.project) {
        return {
            id: resource.project.id,
            name: resource.project.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
            description: resource.project.description,
            key_values: resource.project.keyValues,
            stats: resource.project.stats,
            data_class: resource.project.dataClass,
            created_at: resource.project.createdAt,
            relations: resource.project.relations,
            object_status: resource.project.status,
        } as SearchResultEntry
    } else if (resource.collection) {
        return {
            id: resource.collection.id,
            name: resource.collection.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_COLLECTION,
            description: resource.collection.description,
            key_values: resource.collection.keyValues,
            stats: resource.collection.stats,
            data_class: resource.collection.dataClass,
            created_at: resource.collection.createdAt,
            relations: resource.collection.relations,
            object_status: resource.collection.status,
        } as SearchResultEntry
    } else if (resource.dataset) {
        return {
            id: resource.dataset.id,
            name: resource.dataset.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_DATASET,
            description: resource.dataset.description,
            key_values: resource.dataset.keyValues,
            stats: resource.dataset.stats,
            data_class: resource.dataset.dataClass,
            created_at: resource.dataset.createdAt,
            relations: resource.dataset.relations,
            object_status: resource.dataset.status,
        } as SearchResultEntry
    } else if (resource.object) {
        return {
            id: resource.object.id,
            name: resource.object.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
            description: resource.object.description,
            key_values: resource.object.keyValues,
            stats: {
                size: resource.object.contentLen,
                count: "1",
                lastUpdated: "", // No one cares.
            } as v2Stats,
            data_class: resource.object.dataClass,
            created_at: resource.object.createdAt,
            relations: resource.object.relations,
            object_status: resource.object.status,
        } as SearchResultEntry
    }

    return undefined
}


/* Some number to SI format */
export function formatBytes(bytes: number, decimals = 0) {
    /**
     * Converts any positive number to SI-prefix representation
     *
     * @remarks
     * This method was taken from: https://gist.github.com/zentala/1e6f72438796d74531803cc3833c039c
     *
     * @param bytes - The number of bytes
     * @param decimals - Number of decimal places
     * @returns String SI-prefix representation
     */
    if (bytes == 0) return '0 Bytes';
    var k = 1024,
        dm = decimals || 1,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}