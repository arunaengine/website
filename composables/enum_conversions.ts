import { v2ResourceVariant } from "./aruna_api_json"


export function toResourceType(variant: v2ResourceVariant | undefined): string {
    switch (variant) {
        case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: {
            return "Project"
        }
        case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: {
            return "Collection"
        }
        case v2ResourceVariant.RESOURCE_VARIANT_DATASET: {
            return "Dataset"
        }
        case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: {
            return "Object"
        }
        default: {
            return "Unspecified"
        }
    }
}

/* 
import type { v2DataClass } from "./aruna_api_json"

export function strToDataClass(dataClass: string): v2DataClass{
    switch (dataClass) {
        case 'DATA_CLASS_PUBLIC': {
            return DataClass.PUBLIC
        }
        case 'DATA_CLASS_PRIVATE': {
            return DataClass.PRIVATE
        }
        case 'DATA_CLASS_WORKSPACE': {
            return DataClass.WORKSPACE
        }
        case 'DATA_CLASS_CONFIDENTIAL': {
            return DataClass.CONFIDENTIAL
        }
        default: {
            return DataClass.UNSPECIFIED
        }
    }
}

export function strToObjectStatus(status: string): Status {
    switch (status) {
        case 'STATUS_INITIALIZING': {
            return Status.INITIALIZING
        }
        case 'STATUS_VALIDATING': {
            return Status.VALIDATING
        }
        case 'STATUS_AVAILABLE': {
            return Status.AVAILABLE
        }
        case 'STATUS_UNAVAILABLE': {
            return Status.UNAVAILABLE
        }
        case 'STATUS_ERROR': {
            return Status.ERROR
        }
        case 'STATUS_DELETED': {
            return Status.DELETED
        }
        default: {
            return Status.UNSPECIFIED
        }
    }
}

export function strToPermission(status: string): PermissionLevel {
    switch (status) {
        case 'PERMISSION_LEVEL_NONE': {
            return PermissionLevel.NONE
        }
        case 'PERMISSION_LEVEL_READ': {
            return PermissionLevel.READ
        }
        case 'PERMISSION_LEVEL_APPEND': {
            return PermissionLevel.APPEND
        }
        case 'PERMISSION_LEVEL_WRITE': {
            return PermissionLevel.WRITE
        }
        case 'PERMISSION_LEVEL_ADMIN': {
            return PermissionLevel.ADMIN
        }
        default: {
            return PermissionLevel.UNSPECIFIED
        }
    }
} 
*/