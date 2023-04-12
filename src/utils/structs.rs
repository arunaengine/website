use anyhow::anyhow;
use aruna_rust_api::api::storage::{
    models::v1::{ProjectPermission, User},
    services::v1::CreateApiTokenResponse,
};
use leptos::RwSignal;
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct SimplePermission {
    pub project_id: String,
    pub permission: i32,
}

#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct UserState {
    pub user_id: String,
    pub display_name: String,
    pub email: String,
    pub is_admin: bool,
    pub permissions: Vec<SimplePermission>,
}

impl From<ProjectPermission> for SimplePermission {
    fn from(value: ProjectPermission) -> Self {
        SimplePermission {
            project_id: value.project_id,
            permission: value.permission,
        }
    }
}

impl From<User> for UserState {
    fn from(value: User) -> Self {
        UserState {
            user_id: value.id,
            display_name: value.display_name,
            email: value.email,
            is_admin: value.is_admin,
            permissions: vec![],
        }
    }
}

#[derive(Clone, Copy)]
pub struct UpdateUser(pub RwSignal<bool>);

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    id: String,
    name: String,
    token_secret: String,
    access_key: String,
    secret_key: String,
}

impl TryFrom<CreateApiTokenResponse> for TokenResponse {
    type Error = anyhow::Error;

    fn try_from(value: CreateApiTokenResponse) -> Result<Self, Self::Error> {
        let token_spec = value.token.ok_or_else(|| anyhow!("No token found"))?;
        Ok(Self {
            id: token_spec.id,
            name: token_spec.name,
            token_secret: value.token_secret,
            access_key: value.s3_access_key,
            secret_key: value.s3_secret_key,
        })
    }
}
