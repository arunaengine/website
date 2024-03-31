import { storagemodelsv2ComponentStatus, v2DataClass, v2EndpointVariant, v2KeyValueVariant, v2ResourceVariant } from "./aruna_api_json"

export function toResourceTypeStr(variant: v2ResourceVariant | undefined): string {
    switch (variant) {
        case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: return "Project"
        case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: return "Collection"
        case v2ResourceVariant.RESOURCE_VARIANT_DATASET: return "Dataset"
        case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: return "Object"
        default: return "Unspecified"
    }
}

export function toComponentStatusStr(variant: storagemodelsv2ComponentStatus | undefined): string {
    switch (variant) {
        case storagemodelsv2ComponentStatus.COMPONENT_STATUS_INITIALIZING: return 'Initializing'
        case storagemodelsv2ComponentStatus.COMPONENT_STATUS_AVAILABLE: return 'Available'
        case storagemodelsv2ComponentStatus.COMPONENT_STATUS_DEGRADED: return 'Degraded'
        case storagemodelsv2ComponentStatus.COMPONENT_STATUS_UNAVAILABLE: return 'Unavailable'
        case storagemodelsv2ComponentStatus.COMPONENT_STATUS_MAINTENANCE: return 'Maintenance'
        default: return 'Unspecified'
    }
}

export function toEndpointVariantStr(variant: v2EndpointVariant | undefined): string {
    switch (variant) {
        case v2EndpointVariant.ENDPOINT_VARIANT_PERSISTENT: return 'Persistent'
        case v2EndpointVariant.ENDPOINT_VARIANT_VOLATILE: return 'Volatile'
        default: return 'Unspecified'
    }
}

export function toDataClassStr(variant: v2DataClass | undefined): string {
    switch (variant) {
        case v2DataClass.DATA_CLASS_PUBLIC: return "Public"
        case v2DataClass.DATA_CLASS_PRIVATE: return "Private"
        case v2DataClass.DATA_CLASS_WORKSPACE: return "Workspace"
        case v2DataClass.DATA_CLASS_CONFIDENTIAL: return "Confidential"
        default: return 'Unspecified'
    }
}

export function toKeyValueVariantStr(variant: v2KeyValueVariant | undefined): string {
    switch (variant) {
        case v2KeyValueVariant.KEY_VALUE_VARIANT_LABEL: return "Label"
        case v2KeyValueVariant.KEY_VALUE_VARIANT_STATIC_LABEL: return "Static Label"
        case v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK: return "Hook"
        case v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS: return "Hook Status"
        default: return 'Unspecified'
    }
}