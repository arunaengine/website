import type {
    modelsv2Status,
    v2Author,
    v2DataClass,
    v2GenericResource,
    v2KeyValue,
    v2PermissionLevel,
    v2Relation,
    v2Stats,
} from '@/composables/aruna_api_json';
import {v2ResourceVariant} from "@/composables/aruna_api_json";
import {storagemodelsv2ReplicationStatus} from './aruna_api_json';

/* Object info conversions */
export type ObjectInfo = {
    id: string,
    name: string,
    title: string,
    variant: v2ResourceVariant,
    description: string,
    authors: v2Author[],
    key_values: v2KeyValue[],
    stats: v2Stats,
    data_class: v2DataClass,
    created_at: string,
    relations: v2Relation[],
    object_status: modelsv2Status,
    permission: v2PermissionLevel,
    license: string,
    data_license: string,
    endpoints: EndpointInfo[]
}

export type EndpointInfo = {
    id?: string,
    status?: storagemodelsv2ReplicationStatus
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
            title: resource.project.title,
            variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
            description: resource.project.description,
            authors: resource.project.authors,
            key_values: resource.project.keyValues,
            stats: resource.project.stats,
            data_class: resource.project.dataClass,
            created_at: resource.project.createdAt,
            relations: resource.project.relations,
            object_status: resource.project.status,
            permission: permission,
            license: resource.project.metadataLicenseTag,
            data_license: resource.project.defaultDataLicenseTag,
            endpoints: resource.project.endpoints?.map(x => ({id: x.id, status: x.status} as EndpointInfo))
        } as ObjectInfo
    } else if (resource.collection) {
        return {
            id: resource.collection.id,
            name: resource.collection.name,
            title: resource.collection.title,
            variant: v2ResourceVariant.RESOURCE_VARIANT_COLLECTION,
            description: resource.collection.description,
            authors: resource.collection.authors,
            key_values: resource.collection.keyValues,
            stats: resource.collection.stats,
            data_class: resource.collection.dataClass,
            created_at: resource.collection.createdAt,
            relations: resource.collection.relations,
            object_status: resource.collection.status,
            permission: permission,
            license: resource.collection.metadataLicenseTag,
            data_license: resource.collection.defaultDataLicenseTag,
            endpoints: resource.collection.endpoints?.map(x => ({id: x.id, status: x.status} as EndpointInfo))
        } as ObjectInfo
    } else if (resource.dataset) {
        return {
            id: resource.dataset.id,
            name: resource.dataset.name,
            title: resource.dataset.title,
            variant: v2ResourceVariant.RESOURCE_VARIANT_DATASET,
            description: resource.dataset.description,
            authors: resource.dataset.authors,
            key_values: resource.dataset.keyValues,
            stats: resource.dataset.stats,
            data_class: resource.dataset.dataClass,
            created_at: resource.dataset.createdAt,
            relations: resource.dataset.relations,
            object_status: resource.dataset.status,
            permission: permission,
            license: resource.dataset.metadataLicenseTag,
            data_license: resource.dataset.defaultDataLicenseTag,
            endpoints: resource.dataset.endpoints?.map(x => ({id: x.id, status: x.status} as EndpointInfo))
        } as ObjectInfo
    } else if (resource.object) {
        return {
            id: resource.object.id,
            name: resource.object.name,
            title: resource.object.title,
            variant: v2ResourceVariant.RESOURCE_VARIANT_OBJECT,
            description: resource.object.description,
            authors: resource.object.authors,
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
            endpoints: resource.object.endpoints?.map(x => ({id: x.id, status: x.status} as EndpointInfo))
        } as ObjectInfo
    }

    return undefined
}

/*  */
export type SearchResultEntry = {
    id: string,
    name: string,
    variant: v2ResourceVariant,
    title: string,
    description: string,
    key_values: v2KeyValue[],
    stats: v2Stats,
    data_class: v2DataClass,
    created_at: string,
    relations: v2Relation[],
    object_status: modelsv2Status,
}

export function toSearchResult(resource: v2GenericResource): SearchResultEntry | undefined {
    if (resource.project) {
        return {
            id: resource.project.id,
            name: resource.project.name,
            variant: v2ResourceVariant.RESOURCE_VARIANT_PROJECT,
            title: resource.project.title,
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
            title: resource.collection.title,
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
            title: resource.dataset.title,
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
            title: resource.object.title,
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
    let k = 1024,
        dm = decimals || 1,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}