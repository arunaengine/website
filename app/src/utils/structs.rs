use aruna_rust_api::api::storage::models::v2::{
    generic_resource, relation, Collection, Dataset, ExternalRelation, ExternalRelationVariant,
    InternalRelation, InternalRelationVariant, Object, Project, Relation, RelationDirection, Stats,
};
//use anyhow::anyhow;
// use aruna_rust_api::api::storage::{
//     models::v1::{ProjectOverview, ProjectPermission, Token, User},
//     services::v1::{CreateApiTokenResponse, UserWithPerms},
// };
//use chrono::Local;
use leptos::*;
//use prost_types::Timestamp;
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct SimplePermission {
    pub project_id: String,
    pub permission: i32,
}

impl SimplePermission {
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
    pub is_active: bool,
    pub is_admin: bool,
    pub permissions: Vec<SimplePermission>,
    pub session_id: String,
}

// impl From<ProjectPermission> for SimplePermission {
//     fn from(value: ProjectPermission) -> Self {
//         SimplePermission {
//             project_id: value.project_id,
//             permission: value.permission,
//         }
//     }
// }

// impl From<User> for UserState {
//     fn from(value: User) -> Self {
//         UserState {
//             user_id: value.id,
//             display_name: value.display_name,
//             email: value.email,
//             is_active: value.active,
//             is_admin: value.is_admin,
//             permissions: vec![],
//             session_id: "".to_string(),
//         }
//     }
// }

// impl From<UserWithPerms> for UserState {
//     fn from(value: UserWithPerms) -> Self {
//         let user = value.user.unwrap_or_default();
//         let perms = value
//             .project_perms
//             .into_iter()
//             .map(|p| p.into())
//             .collect::<Vec<_>>();
//         UserState {
//             user_id: user.id,
//             display_name: user.display_name,
//             email: user.email,
//             is_active: user.active,
//             is_admin: user.is_admin,
//             permissions: perms,
//             session_id: "".to_string(),
//         }
//     }
// }

#[derive(Clone, Copy)]
pub struct UpdateUser(pub RwSignal<bool>);

#[derive(Clone, Copy)]
pub struct UpdateTokens(pub RwSignal<bool>);

#[derive(Clone, Copy)]
pub struct UpdateAdmin(pub RwSignal<bool>);

#[derive(Clone, Copy)]
pub struct UpdateAdminProjects(pub RwSignal<bool>);

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub id: String,
    pub name: String,
    pub token_secret: String,
    pub access_key: String,
    pub secret_key: String,
}

// impl TryFrom<CreateApiTokenResponse> for TokenResponse {
//     type Error = anyhow::Error;

//     fn try_from(value: CreateApiTokenResponse) -> Result<Self, Self::Error> {
//         let token_spec = value.token.ok_or_else(|| anyhow!("No token found"))?;
//         Ok(Self {
//             id: token_spec.id,
//             name: token_spec.name,
//             token_secret: value.token_secret,
//             access_key: value.s3_access_key,
//             secret_key: value.s3_secret_key,
//         })
//     }
// }

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

// impl From<Token> for TokenStats {
//     fn from(value: Token) -> Self {
//         let perm = match value.permission() {
//             aruna_rust_api::api::storage::models::v1::Permission::Read => "READ".to_string(),
//             aruna_rust_api::api::storage::models::v1::Permission::Append => "APPEND".to_string(),
//             aruna_rust_api::api::storage::models::v1::Permission::Modify => "MODIFY".to_string(),
//             aruna_rust_api::api::storage::models::v1::Permission::Admin => "ADMIN".to_string(),
//             _ => "NONE".to_string(),
//         };

//         let token_type = match value.token_type() {
//             aruna_rust_api::api::storage::models::v1::TokenType::Unspecified => TokenType::PERSONAL,
//             aruna_rust_api::api::storage::models::v1::TokenType::Personal => TokenType::PERSONAL,
//             aruna_rust_api::api::storage::models::v1::TokenType::Scoped => {
//                 if !value.collection_id.is_empty() {
//                     TokenType::COLLECTION(value.collection_id, perm)
//                 } else if !value.project_id.is_empty() {
//                     TokenType::COLLECTION(value.project_id, perm)
//                 } else {
//                     TokenType::PERSONAL
//                 }
//             }
//         };

//         TokenStats {
//             id: value.id,
//             name: value.name,
//             token_type,
//             created_at: format_time_stamp(value.created_at),
//             expires_at: format_time_stamp(value.expires_at),
//             is_session: value.is_session,
//             used_at: format_time_stamp(value.used_at),
//         }
//     }
// }

// pub fn format_time_stamp(ts: Option<Timestamp>) -> String {
//     let raw_ts = ts.unwrap_or_default();
//     let as_ndt = chrono::NaiveDateTime::from_timestamp_opt(raw_ts.seconds, raw_ts.nanos as u32)
//         .unwrap_or_default();
//     as_ndt
//         .and_local_timezone(Local)
//         .latest()
//         .unwrap_or_default()
//         .format("%Y-%m-%d %H:%M:%S")
//         .to_string()
// }

#[derive(Debug, Default, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct ProjectOverviewWeb {
    pub id: String,
    pub name: String,
    pub description: String,
    pub collection_ids: Vec<String>,
    pub user_ids: Vec<String>,
}

// impl From<ProjectOverview> for ProjectOverviewWeb {
//     fn from(value: ProjectOverview) -> Self {
//         ProjectOverviewWeb {
//             id: value.id,
//             name: value.name,
//             description: value.description,
//             collection_ids: value.collection_ids,
//             user_ids: value.user_ids,
//         }
//     }
// }

#[derive(Debug, Default, Clone)]
pub struct SearchResultEntry {
    pub id: String,
    pub name: String,
    pub variant: String,
    pub description: String,
    pub key_values: Vec<(String, String)>,
    pub stats: VisualizedStats,
    pub data_class: String,
    pub created_at: String,
    pub relations: Vec<WebRelation>,
}

#[derive(Debug, Default, Clone)]
pub struct VisualizedStats {
    pub count: u64,
    pub size: String,
}

impl From<Option<Stats>> for VisualizedStats {
    fn from(value: Option<Stats>) -> Self {
        match value {
            Some(val) => VisualizedStats {
                count: val.count as u64,
                size: bytesize::ByteSize(val.size as u64).to_string_as(true),
            },
            None => VisualizedStats {
                count: 0,
                size: "-".to_string(),
            },
        }
    }
}

impl From<i64> for VisualizedStats {
    fn from(value: i64) -> Self {
        VisualizedStats {
            count: 1,
            size: bytesize::ByteSize(value as u64).to_string_as(true),
        }
    }
}

#[derive(Debug, Clone)]
pub enum WebRelation {
    Internal(RelationVariant),
    External(RelationVariant),
}

impl WebRelation {
    pub fn is_external(&self) -> bool {
        match self {
            WebRelation::Internal(_) => false,
            WebRelation::External(_) => true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RelationVariant {
    pub target: String,
    pub target_name: String,
    pub relation_type: String,
    pub inbound: bool,
}

impl From<InternalRelation> for RelationVariant {
    fn from(value: InternalRelation) -> Self {
        let relation_type = match value.defined_variant() {
            InternalRelationVariant::Unspecified => value.custom_variant().to_string(),
            _ => format!("{:?}", value.defined_variant()),
        };

        RelationVariant {
            target: value.resource_id.clone(),
            target_name: format!("{:?}", value.resource_variant()),
            relation_type,
            inbound: value.direction() == RelationDirection::Inbound,
        }
    }
}

impl From<ExternalRelation> for RelationVariant {
    fn from(value: ExternalRelation) -> Self {
        let relation_type = match value.defined_variant() {
            ExternalRelationVariant::Unspecified => value.custom_variant().to_string(),
            _ => format!("{:?}", value.defined_variant()),
        };

        RelationVariant {
            target: value.identifier,
            target_name: "External".to_string(),
            relation_type,
            inbound: true,
        }
    }
}

impl From<relation::Relation> for WebRelation {
    fn from(value: relation::Relation) -> Self {
        match value {
            relation::Relation::Internal(r) => WebRelation::Internal(r.into()),
            relation::Relation::External(r) => WebRelation::External(r.into()),
        }
    }
}

pub fn from_relation_vec(relations: Vec<Relation>) -> Vec<WebRelation> {
    relations
        .into_iter()
        .filter_map(|r| r.relation.map(|e| e.into()))
        .collect::<Vec<_>>()
}

pub fn data_class_to_string(class: i32) -> String {
    match class {
        1 => "Public".to_string(),
        2 => "Private".to_string(),
        4 => "Workspace".to_string(),
        5 => "Confidential".to_string(),
        _ => "Unknown".to_string(),
    }
}

pub fn timestamp_to_string(ts: Option<prost_wkt_types::Timestamp>) -> String {
    match ts {
        Some(ts) => serde_json::to_string_pretty(&ts).expect("Failed to serialize request"),
        None => "Unknown".to_string(),
    }
}

impl From<generic_resource::Resource> for SearchResultEntry {
    fn from(value: generic_resource::Resource) -> Self {
        match value {
            generic_resource::Resource::Project(Project {
                id,
                name,
                description,
                key_values,
                stats,
                data_class,
                created_at,
                relations,
                ..
            }) => SearchResultEntry {
                id: id.to_string(),
                name,
                variant: "Project".to_string(),
                description: description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| (kv.key, kv.value))
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
            },
            generic_resource::Resource::Collection(Collection {
                id,
                name,
                description,
                key_values,
                stats,
                data_class,
                created_at,
                relations,
                ..
            }) => SearchResultEntry {
                id: id.to_string(),
                name,
                variant: "Collection".to_string(),
                description: description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| (kv.key, kv.value))
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
            },
            generic_resource::Resource::Dataset(Dataset {
                id,
                name,
                description,
                key_values,
                stats,
                data_class,
                created_at,
                relations,
                ..
            }) => SearchResultEntry {
                id: id.to_string(),
                name,
                variant: "Dataset".to_string(),
                description: description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| (kv.key, kv.value))
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
            },
            generic_resource::Resource::Object(Object {
                id,
                name,
                description,
                key_values,
                content_len,
                data_class,
                created_at,
                relations,
                ..
            }) => SearchResultEntry {
                id: id.to_string(),
                name,
                variant: "Object".to_string(),
                description: description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| (kv.key, kv.value))
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(content_len),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
            },
        }
    }
}

impl SearchResultEntry {
    pub fn get_card_status(&self) -> impl IntoView {
        match self.data_class.as_str() {
            "Public" => view! { <div class="card-status-start bg-green"></div> },
            "Private" => view! { <div class="card-status-start bg-orange"></div> },
            "Workspace" => view! { <div class="card-status-start bg-cyan"></div> },
            "Confidential" => view! { <div class="card-status-start bg-red"></div> },
            _ => view! { <div class="card-status-start bg-red"></div> },
        }
    }

    pub fn get_ribbon(&self) -> impl IntoView {
        match self.variant.as_str() {
            "Project" => view! {
                <div class="ribbon bg-red">
                    Project
                </div>
            },
            "Collection" => view! {
                <div class="ribbon bg-orange">
                    Collection
                </div>
            },
            "Dataset" => view! {
                <div class="ribbon bg-green">
                    Dataset
                </div>
            },
            "Object" => view! {
                <div class="ribbon">
                    Object
                </div>
            },
            _ => view! {
                <div class="ribbon bg-red">
                    Unknown
                </div>
            },
        }
    }

    pub fn get_status(&self) -> impl IntoView {
        match self.data_class.as_str() {
            "Public" => view! {
                <span class="status status-green m-1">
                    Public
                </span>
            },
            "Private" => view! {
                <span class="status status-orange m-1">
                    Private
                </span>
            },
            "Workspace" => view! {
                <span class="status status-cyan m-1">
                    Workspace
                </span>
            },
            "Confidential" => view! {
                <span class="status status-red m-1">
                    Confidential
                </span>
            },
            _ => view! {
                <span class="status status-red m-1">
                    Unknown
                </span>
            },
        }
    }

    pub fn get_stats(&self) -> impl IntoView {
        view! {
            <span class="status status-yellow m-1">
                Count:
                {self.stats.count}
            </span>
            <span class="status status-cyan m-1">{self.stats.size.to_string()}</span>
        }
    }

    pub fn get_key_values(&self) -> impl IntoView {
        let kv = self.key_values.clone();
        view! {
            <For
                each=move || { kv.clone().into_iter().enumerate() }
                key=|(index, _k)| *index
                view=move |kv| {
                    view! {
                        <div class="d-inline-flex tag">
                            <div class="key text-secondary">{kv.1.0}</div>
                            <div class="value">{kv.1.1}</div>
                        </div>
                    }
                }
            />
        }
    }
}
