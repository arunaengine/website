import {
  modelsv2Status,
  storagemodelsv2ComponentStatus,
  storagemodelsv2ReplicationStatus,
  v2AnnouncementType,
  v2DataClass,
  v2EndpointVariant,
  v2InternalRelationVariant,
  v2KeyValueVariant,
  v2PermissionLevel,
  v2RelationDirection,
  v2ResourceVariant
} from "./aruna_api_json"

export function toAnnouncementTypeStr(variant: v2AnnouncementType | undefined): string {
  switch (variant) {
    case v2AnnouncementType.ANNOUNCEMENT_TYPE_ORGA: return "Orga"
    case v2AnnouncementType.ANNOUNCEMENT_TYPE_RELEASE: return "Release"
    case v2AnnouncementType.ANNOUNCEMENT_TYPE_UPDATE: return "Update"
    case v2AnnouncementType.ANNOUNCEMENT_TYPE_MAINTENANCE: return "Maintenance"
    case v2AnnouncementType.ANNOUNCEMENT_TYPE_BLOG: return "Blog"
    default: return "Unspecified"
  }
}

export function toResourceTypeStr(variant: v2ResourceVariant | undefined): string {
    switch (variant) {
        case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: return "Project"
        case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: return "Collection"
        case v2ResourceVariant.RESOURCE_VARIANT_DATASET: return "Dataset"
        case v2ResourceVariant.RESOURCE_VARIANT_OBJECT: return "Object"
        default: return "Unspecified"
    }
}

export function fromResourceTypeStr(
        variant: string | undefined,
        default_value: v2ResourceVariant | undefined = v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED): v2ResourceVariant {
    if (variant) {
      switch (variant.toLowerCase()) {
        case "project": return v2ResourceVariant.RESOURCE_VARIANT_PROJECT
        case "collection": return v2ResourceVariant.RESOURCE_VARIANT_COLLECTION
        case "dataset": return v2ResourceVariant.RESOURCE_VARIANT_DATASET
        case "object": return v2ResourceVariant.RESOURCE_VARIANT_OBJECT
      }
    }
    return default_value
}

export function getChildResourceType(variant: v2ResourceVariant | undefined): v2ResourceVariant {
    switch (variant) {
        case v2ResourceVariant.RESOURCE_VARIANT_PROJECT: return v2ResourceVariant.RESOURCE_VARIANT_COLLECTION
        case v2ResourceVariant.RESOURCE_VARIANT_COLLECTION: return v2ResourceVariant.RESOURCE_VARIANT_DATASET
        case v2ResourceVariant.RESOURCE_VARIANT_DATASET: return v2ResourceVariant.RESOURCE_VARIANT_OBJECT
        default: return v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED
    }
}

export function toPermissionTypeStr(variant: v2PermissionLevel | undefined): string {
    switch (variant) {
        case v2PermissionLevel.PERMISSION_LEVEL_NONE: return "None"
        case v2PermissionLevel.PERMISSION_LEVEL_READ: return "Read"
        case v2PermissionLevel.PERMISSION_LEVEL_APPEND: return "Append"
        case v2PermissionLevel.PERMISSION_LEVEL_WRITE: return "Write"
        case v2PermissionLevel.PERMISSION_LEVEL_ADMIN: return "Admin"
        default: return "Unspecified"
    }
}

export function toObjectStatusStr(variant: modelsv2Status | undefined): string {
    switch (variant) {
        case modelsv2Status.STATUS_INITIALIZING: return 'Initializing'
        case modelsv2Status.STATUS_VALIDATING: return 'Validating'
        case modelsv2Status.STATUS_AVAILABLE: return 'Available'
        case modelsv2Status.STATUS_UNAVAILABLE: return 'Unavailable'
        case modelsv2Status.STATUS_DELETED: return 'Deleted'
        case modelsv2Status.STATUS_ERROR: return 'Error'
        default: return 'Unspecified'
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

export function fromDataClassStr(string: string | undefined): v2DataClass {
    if (string)
      switch (string.toLowerCase()) {
        case "public" : return v2DataClass.DATA_CLASS_PUBLIC
        case "private" : return v2DataClass.DATA_CLASS_PRIVATE
        case "workspace" : return v2DataClass.DATA_CLASS_WORKSPACE
        case "confidential" : return v2DataClass.DATA_CLASS_CONFIDENTIAL
      }
    return v2DataClass.DATA_CLASS_UNSPECIFIED
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

export function toRelationVariantStr(variant: v2InternalRelationVariant | undefined): string {
    switch (variant) {
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_BELONGS_TO: return "Belongs To"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_ORIGIN: return "Static Label"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_VERSION: return "Version"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_METADATA: return "Metadata"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY: return "Policy"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_DELETED: return "Deleted"
        case v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_CUSTOM: return "Custom"
        default: return 'Unspecified'
    }
}

export function toRelationDirectionStr(variant: v2RelationDirection | undefined): string {
    switch (variant) {
        case v2RelationDirection.RELATION_DIRECTION_INBOUND: return "Inbound"
        case v2RelationDirection.RELATION_DIRECTION_OUTBOUND: return "Outbound"
        default: return 'Unspecified'
    }
}

export function toReplicationStatusStr(variant: storagemodelsv2ReplicationStatus | undefined): string {
    switch (variant) {
        case storagemodelsv2ReplicationStatus.REPLICATION_STATUS_WAITING: return "Waiting"
        case storagemodelsv2ReplicationStatus.REPLICATION_STATUS_RUNNING: return "Running"
        case storagemodelsv2ReplicationStatus.REPLICATION_STATUS_FINISHED: return "Finished"
        case storagemodelsv2ReplicationStatus.REPLICATION_STATUS_ERROR: return "Error"
        default: return 'Unspecified'
    }
}