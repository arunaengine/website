use anyhow::anyhow;
use aruna_rust_api::api::storage::{
    models::v1::{ProjectPermission, Token, User},
    services::v1::CreateApiTokenResponse,
};
use chrono::Local;
use leptos::RwSignal;
use prost_types::Timestamp;
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct SimplePermission {
    pub project_id: String,
    pub permission: i32,
}

impl SimplePermission{
    pub fn to_permission_string(&self) -> String {
        match self.permission {
            0 => "-".to_string(),
            2 => "READ".to_string(),
            3 => "APPEND".to_string(),
            4 => "MODIFY".to_string(),
            5 => "ADMIN".to_string(),
            _ => "NONE".to_string(),
        }
    }
}

#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct UserState {
    pub user_id: String,
    pub display_name: String,
    pub email: String,
    pub is_admin: bool,
    pub permissions: Vec<SimplePermission>,
    pub session_id: String,
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
            session_id: "".to_string(),
        }
    }
}

#[derive(Clone, Copy)]
pub struct UpdateUser(pub RwSignal<bool>);

#[derive(Clone, Copy)]
pub struct UpdateTokens(pub RwSignal<bool>);

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub id: String,
    pub name: String,
    pub token_secret: String,
    pub access_key: String,
    pub secret_key: String,
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

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub enum TokenType {
    #[default]
    PERSONAL,
    COLLECTION(String, String),
    PROJECT(String, String),
}

impl TokenType {
    pub fn get_type_variant(&self) -> String {
        match self {
            TokenType::PERSONAL => "PERSONAL".to_string(),
            TokenType::COLLECTION(_, _) => "COLLECTION".to_string(),
            TokenType::PROJECT(_, _) => "PROJECT".to_string(),
        }
    }

    pub fn get_target_id(&self) -> String {
        match self {
            TokenType::PERSONAL => "-".to_string(),
            TokenType::COLLECTION(a, _) => a.to_string(),
            TokenType::PROJECT(a, _) => a.to_string(),
        }
    }

    pub fn get_permission(&self) -> String {
        match self {
            TokenType::PERSONAL => "-".to_string(),
            TokenType::COLLECTION(_, a) => a.to_string(),
            TokenType::PROJECT(_, a) => a.to_string(),
        }
    }
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TokenStats {
    pub id: String,
    pub name: String,
    pub token_type: TokenType,
    pub created_at: String,
    pub expires_at: String,
    pub is_session: bool,
    pub used_at: String,
}

impl From<Token> for TokenStats {
    fn from(value: Token) -> Self {
        let perm = match value.permission() {
            aruna_rust_api::api::storage::models::v1::Permission::Read => "READ".to_string(),
            aruna_rust_api::api::storage::models::v1::Permission::Append => "APPEND".to_string(),
            aruna_rust_api::api::storage::models::v1::Permission::Modify => "MODIFY".to_string(),
            aruna_rust_api::api::storage::models::v1::Permission::Admin => "ADMIN".to_string(),
            _ => "NONE".to_string(),
        };

        let token_type = match value.token_type() {
            aruna_rust_api::api::storage::models::v1::TokenType::Unspecified => TokenType::PERSONAL,
            aruna_rust_api::api::storage::models::v1::TokenType::Personal => TokenType::PERSONAL,
            aruna_rust_api::api::storage::models::v1::TokenType::Scoped => {
                if !value.collection_id.is_empty() {
                    TokenType::COLLECTION(value.collection_id, perm)
                } else if !value.project_id.is_empty() {
                    TokenType::COLLECTION(value.project_id, perm)
                } else {
                    TokenType::PERSONAL
                }
            }
        };

        TokenStats {
            id: value.id,
            name: value.name,
            token_type,
            created_at: format_time_stamp(value.created_at),
            expires_at: format_time_stamp(value.expires_at),
            is_session: value.is_session,
            used_at: format_time_stamp(value.used_at),
        }
    }
}

pub fn format_time_stamp(ts: Option<Timestamp>) -> String {
    let raw_ts = ts.unwrap_or_default();
    let as_ndt = chrono::NaiveDateTime::from_timestamp_opt(raw_ts.seconds, raw_ts.nanos as u32)
        .unwrap_or_default();
    as_ndt
        .and_local_timezone(Local)
        .latest()
        .unwrap_or_default()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string()
}
