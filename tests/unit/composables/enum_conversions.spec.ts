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
  v2ResourceVariant,
} from '~/composables/aruna_api_json'
import {
  fromDataClassStr,
  fromResourceTypeStr,
  getChildResourceType,
  toAnnouncementTypeStr,
  toComponentStatusStr,
  toDataClassStr,
  toEndpointVariantStr,
  toKeyValueVariantStr,
  toObjectStatusStr,
  toPermissionTypeStr,
  toRelationDirectionStr,
  toRelationVariantStr,
  toReplicationStatusStr,
  toResourceTypeStr,
} from '~/composables/enum_conversions'

describe('composables/enum_conversions', () => {
  it('maps announcement variants to display strings', () => {
    expect(toAnnouncementTypeStr(v2AnnouncementType.ANNOUNCEMENT_TYPE_RELEASE)).toBe('Release')
    expect(toAnnouncementTypeStr(undefined)).toBe('Unspecified')
  })

  it('maps resource variants in both directions', () => {
    expect(toResourceTypeStr(v2ResourceVariant.RESOURCE_VARIANT_DATASET)).toBe('Dataset')
    expect(fromResourceTypeStr('object')).toBe(v2ResourceVariant.RESOURCE_VARIANT_OBJECT)
    expect(fromResourceTypeStr('unknown')).toBe(v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED)
  })

  it('derives the next child resource type', () => {
    expect(getChildResourceType(v2ResourceVariant.RESOURCE_VARIANT_PROJECT)).toBe(
      v2ResourceVariant.RESOURCE_VARIANT_COLLECTION
    )
    expect(getChildResourceType(v2ResourceVariant.RESOURCE_VARIANT_OBJECT)).toBe(
      v2ResourceVariant.RESOURCE_VARIANT_UNSPECIFIED
    )
  })

  it('maps permission, object, component, endpoint, and replication statuses', () => {
    expect(toPermissionTypeStr(v2PermissionLevel.PERMISSION_LEVEL_WRITE)).toBe('Write')
    expect(toObjectStatusStr(modelsv2Status.STATUS_DELETED)).toBe('Deleted')
    expect(toComponentStatusStr(storagemodelsv2ComponentStatus.COMPONENT_STATUS_MAINTENANCE)).toBe('Maintenance')
    expect(toEndpointVariantStr(v2EndpointVariant.ENDPOINT_VARIANT_PERSISTENT)).toBe('Persistent')
    expect(toReplicationStatusStr(storagemodelsv2ReplicationStatus.REPLICATION_STATUS_RUNNING)).toBe('Running')
  })

  it('maps data class strings in both directions', () => {
    expect(toDataClassStr(v2DataClass.DATA_CLASS_CONFIDENTIAL)).toBe('Confidential')
    expect(fromDataClassStr('workspace')).toBe(v2DataClass.DATA_CLASS_WORKSPACE)
    expect(fromDataClassStr('')).toBe(v2DataClass.DATA_CLASS_UNSPECIFIED)
  })

  it('maps key value and relation variants', () => {
    expect(toKeyValueVariantStr(v2KeyValueVariant.KEY_VALUE_VARIANT_HOOK_STATUS)).toBe('Hook Status')
    expect(toRelationVariantStr(v2InternalRelationVariant.INTERNAL_RELATION_VARIANT_POLICY)).toBe('Policy')
    expect(toRelationDirectionStr(v2RelationDirection.RELATION_DIRECTION_OUTBOUND)).toBe('Outbound')
  })
})
