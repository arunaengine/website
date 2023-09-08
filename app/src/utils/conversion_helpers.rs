use aruna_rust_api::api::storage::models::v2::{permission::ResourceId, Permission};

pub fn extract_type_id(res: Option<ResourceId>) -> (String, String) {
    match res {
        Some(ResourceId::ProjectId(i)) => (i.to_string(), "PROJECT".to_string()),
        Some(ResourceId::CollectionId(i)) => (i.to_string(), "COLLECTION".to_string()),
        Some(ResourceId::DatasetId(i)) => (i.to_string(), "DATASET".to_string()),
        Some(ResourceId::ObjectId(i)) => (i.to_string(), "OBJECT".to_string()),
        None => ("".to_string(), "".to_string()),
    }
}

pub fn to_permission_string(perm: Permission) -> String {
    match perm.permission_level() {
        aruna_rust_api::api::storage::models::v2::PermissionLevel::Read => "READ".to_string(),
        aruna_rust_api::api::storage::models::v2::PermissionLevel::Append => "APPEND".to_string(),
        aruna_rust_api::api::storage::models::v2::PermissionLevel::Write => "WRITE".to_string(),
        aruna_rust_api::api::storage::models::v2::PermissionLevel::Admin => "ADMIN".to_string(),
        _ => "NONE".to_string(),
    }
}
