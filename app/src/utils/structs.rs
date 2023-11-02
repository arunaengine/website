use aruna_rust_api::api::storage::models::v2::{
    generic_resource, relation, Collection, Dataset, ExternalRelation, ExternalRelationVariant,
    InternalRelation, InternalRelationVariant, KeyValue, Object, Permission, Project, Relation,
    RelationDirection, Stats, Status, User,
};
//use anyhow::anyhow;
// use aruna_rust_api::api::storage::{
//     models::v1::{ProjectOverview, ProjectPermission, Token, User},
//     services::v1::{CreateApiTokenResponse, UserWithPerms},
// };
//use chrono::Local;
use leptos::*;
use leptos_router::*;
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum WhoamiResponse {
    User(User),
    NotRegistered,
    NotActivated,
    NotLoggedIn,
    ShouldLogin,
    Error(String),
}

impl WhoamiResponse {
    pub fn is_logged_in(&self) -> bool {
        match self {
            WhoamiResponse::User(_) => true,
            _ => false,
        }
    }

    pub fn maybe_user(&self) -> Option<User> {
        match self {
            WhoamiResponse::User(u) => Some(u.clone()),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct GetOwnedResources {
    #[serde(default)]
    pub perms: Vec<Permission>,
}

#[derive(Clone, Copy)]
pub struct UpdateTokens(pub RwSignal<bool>);

#[derive(Clone, Copy)]
pub struct UpdateAdminProjects(pub RwSignal<bool>);
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

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub filter: String,
    pub limit: i64,
    pub offset: i64,
}
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct CreateResource {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResourceType {
    Project,
    Collection,
    Dataset,
    Object,
}

#[derive(Debug, Default, Clone)]
pub struct SearchResultEntry {
    pub id: String,
    pub name: String,
    pub variant: String,
    pub description: String,
    pub key_values: Vec<WebKV>,
    pub stats: VisualizedStats,
    pub data_class: String,
    pub created_at: String,
    pub relations: Vec<WebRelation>,
    pub object_status: String,
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

#[derive(Debug, Default, Clone)]
pub struct WebKV {
    pub key: String,
    pub value: String,
    pub variant: i32,
    pub status: i32,
}

impl WebKV {
    pub fn get_key(&self) -> String {
        self.key.to_string()
    }

    pub fn get_value(&self) -> String {
        self.value.to_string()
    }

    pub fn is_hook(&self) -> bool {
        self.variant == 3
    }

    pub fn is_label(&self) -> bool {
        self.variant == 1 || self.variant == 2
    }

    pub fn is_static(&self) -> bool {
        self.variant == 2
    }

    pub fn into_table_view(self) -> impl IntoView {
        let WebKV {
            key, value, status, ..
        } = self.clone();
        let key_2 = key.clone();
        view! {
            <tr>
                <td class="text-start">
                    <A
                        href=format!(
                            "/search?filter_key={}&filter_value={}", key.clone(), value.clone()
                        )

                        exact=true
                        class=""
                    >
                        <div>{key_2}</div>
                    </A>

                </td>

                <td>
                    <A
                        href=format!(
                            "/search?filter_key={}&filter_value={}", key.clone(), value.clone()
                        )

                        exact=true
                        class=""
                    >
                        <div>{value.clone()}</div>
                    </A>
                </td>

                <td class="align-self-end p-1">
                    {if self.is_static() && status == 3 {
                        view! {
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-check"
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                fill="none"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M5 12l5 5l10 -10"></path>
                            </svg>
                        }
                            .into_view()
                    } else if status == 1 {
                        view! {
                            <span class="status status-green">
                                Running
                            </span>
                        }
                            .into_view()
                    } else if status == 2 {
                        view! {
                            <span class="status status-red">
                                Error
                            </span>
                        }
                            .into_view()
                    } else {
                        ().into_view()
                    }}

                </td>
            </tr>
        }
    }
}

impl From<KeyValue> for WebKV {
    fn from(value: KeyValue) -> Self {
        WebKV {
            key: value.key.to_string(),
            value: value.value.to_string(),
            variant: value.variant,
            status: if &value.key == "plastrack.mash" {
                1
            } else if &value.key == "plastrack.count_kmers" {
                2
            } else {
                3
            },
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

    pub fn into_table_view(self) -> impl IntoView {
        match self {
            WebRelation::Internal(r) => {
                let r_2 = r.clone();
                view! {
                    <tr>
                        <td class="text-start">
                            <A
                                href=format!("/objects/{}", r.target.to_string())
                                exact=true
                                class=""
                            >
                                <div>
                                    {r.get_inbound_icon()}
                                    <span class="ms-2">{r.target.to_string()}</span>
                                </div>
                            </A>
                        </td>

                        <td>{r_2.get_object_batch()}</td>

                        <td>{r_2.internal_relation_type_status()}</td>
                    </tr>
                }
            }
            WebRelation::External(r) => {
                let r_2 = r.clone();
                view! {
                    <tr>
                        <td class="text-start">
                            <A href=format!("{}", r.target.to_string()) exact=true class="ms-1">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon me-2"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    stroke-width="2"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M9 15l6 -6"></path>
                                    <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                    <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                </svg>
                                {r.target.to_string()}
                            </A>
                        </td>

                        <td>{r_2.external_relation_type_status()}</td>
                    </tr>
                }
            }
        }
    }

    pub fn is_incoming(&self) -> bool {
        match self {
            WebRelation::Internal(r) => r.inbound,
            WebRelation::External(r) => r.inbound,
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

impl RelationVariant {
    pub fn get_inbound_icon(&self) -> impl IntoView {
        if !self.inbound {
            view! {
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="icon icon-tabler icon-tabler-arrow-big-right-lines"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M12 9v-3.586a1 1 0 0 1 1.707 -.707l6.586 6.586a1 1 0 0 1 0 1.414l-6.586 6.586a1 1 0 0 1 -1.707 -.707v-3.586h-3v-6h3z"></path>
                    <path d="M3 9v6"></path>
                    <path d="M6 9v6"></path>
                </svg>
            }
        } else {
            view! {
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="icon icon-tabler icon-tabler-arrow-big-left-lines"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    stroke-width="2"
                    stroke="currentColor"
                    fill="none"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                    <path d="M12 15v3.586a1 1 0 0 1 -1.707 .707l-6.586 -6.586a1 1 0 0 1 0 -1.414l6.586 -6.586a1 1 0 0 1 1.707 .707v3.586h3v6h-3z"></path>
                    <path d="M21 15v-6"></path>
                    <path d="M18 15v-6"></path>
                </svg>
            }
        }
    }

    pub fn get_object_batch(&self) -> impl IntoView {
        match self.target_name.as_str() {
            "Project" => {
                view! {
                    <span class="text-muted">
                        Project
                    </span>
                }
            }
            "Collection" => {
                view! {
                    <span class="text-muted">
                        Collection
                    </span>
                }
            }
            "Dataset" => {
                view! {
                    <span class="text-muted">
                        Dataset
                    </span>
                }
            }
            "Object" => {
                view! {
                    <span class="text-muted">
                        Object
                    </span>
                }
            }
            _ => {
                view! {
                    <span class="text-muted">
                        Unknown
                    </span>
                }
            }
        }
    }

    pub fn internal_relation_type_status(&self) -> impl IntoView {
        match self.relation_type.as_str() {
            "BelongsTo" => {
                if self.inbound {
                    view! {
                        <span class="text-muted">
                            Parent
                        </span>
                    }
                } else {
                    view! {
                        <span class="text-muted">
                            Child
                        </span>
                    }
                }
            }
            "Origin" => {
                view! {
                    <span class="text-muted">
                        Origin
                    </span>
                }
            }
            "Version" => {
                view! {
                    <span class="status status-orange">
                        Version
                    </span>
                }
            }
            "Metadata" => {
                view! {
                    <span class="text-muted">
                        Metadata
                    </span>
                }
            }
            "Policy" => {
                view! {
                    <span class="text-muted">
                        Policy
                    </span>
                }
            }
            _ => {
                view! { <span class="text-muted">{self.relation_type.to_ascii_uppercase()}</span> }
            }
        }
    }

    pub fn external_relation_type_status(&self) -> impl IntoView {
        match self.relation_type.as_str() {
            "Url" => {
                view! {
                    <span class="text-muted">
                        Identifier
                    </span>
                }
            }

            "Identifier" => {
                view! {
                    <span class="text-muted">
                        Url
                    </span>
                }
            }
            _ => {
                view! { <span class="text-muted">{self.relation_type.to_ascii_uppercase()}</span> }
            }
        }
    }
}

impl From<InternalRelation> for RelationVariant {
    fn from(value: InternalRelation) -> Self {
        let relation_type = match value.defined_variant() {
            InternalRelationVariant::Unspecified | InternalRelationVariant::Custom => {
                value.custom_variant().to_string()
            }
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
            ExternalRelationVariant::Unspecified | ExternalRelationVariant::Custom => {
                value.custom_variant().to_string()
            }
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
                description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| kv.into())
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
                object_status: "Available".to_string(),
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
                description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| kv.into())
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
                object_status: "Available".to_string(),
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
                description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| kv.into())
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(stats),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
                object_status: "Available".to_string(),
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
                status,
                ..
            }) => SearchResultEntry {
                id: id.to_string(),
                name,
                variant: "Object".to_string(),
                description,
                key_values: key_values
                    .into_iter()
                    .map(|kv| kv.into())
                    .collect::<Vec<_>>(),
                stats: VisualizedStats::from(content_len),
                data_class: data_class_to_string(data_class),
                created_at: timestamp_to_string(created_at),
                relations: from_relation_vec(relations),
                object_status: Status::try_from(status)
                    .map(|s| format!("{:?}", s))
                    .unwrap_or_else(|_| "Unknown".to_string()),
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
                <div class="ribbon bg-blue">
                    Project
                </div>
            },
            "Collection" => view! {
                <div class="ribbon bg-orange">
                    Collection
                </div>
            },
            "Dataset" => view! {
                <div class="ribbon bg-cyan">
                    Dataset
                </div>
            },
            "Object" => view! {
                <div class="ribbon bg-green">
                    Object
                </div>
            },
            _ => view! {
                <div class="ribbon bg-pink">
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

    pub fn get_data_class_badge(&self) -> impl IntoView {
        match self.data_class.as_str() {
            "Public" => {
                view! { <span class="badge badge-outline text-green">{self.data_class.to_string()}</span> }
            }
            "Private" => {
                view! { <span class="badge badge-outline text-orange">{self.data_class.to_string()}</span> }
            }
            "Workspace" => {
                view! { <span class="badge badge-outline text-cyan">{self.data_class.to_string()}</span> }
            }
            "Confidential" => {
                view! { <span class="badge badge-outline text-red">{self.data_class.to_string()}</span> }
            }
            _ => {
                view! { <span class="badge badge-outline text-red">{self.data_class.to_string()}</span> }
            }
        }
    }

    pub fn get_type_badge(&self) -> impl IntoView {
        match self.variant.as_str() {
            "Project" => {
                view! { <span class="badge badge-outline text-blue">{self.variant.to_string()}</span> }
            }
            "Collection" => {
                view! { <span class="badge badge-outline text-orange">{self.variant.to_string()}</span> }
            }
            "Dataset" => {
                view! { <span class="badge badge-outline text-cyan">{self.variant.to_string()}</span> }
            }
            "Object" => {
                view! { <span class="badge badge-outline text-blue">{self.variant.to_string()}</span> }
            }
            _ => {
                view! { <span class="badge badge-outline text-blue">{self.variant.to_string()}</span> }
            }
        }
    }

    pub fn get_status_badge(&self) -> impl IntoView {
        match self.object_status.as_str() {
            "Available" => {
                view! { <span class="badge badge-outline text-green">{self.object_status.to_string()}</span> }
            }
            "Error" => {
                view! { <span class="badge badge-outline text-red">{self.object_status.to_string()}</span> }
            }
            _ => {
                view! { <span class="badge badge-outline text-blue">{self.object_status.to_string()}</span> }
            }
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

        let only_labels = kv
            .iter()
            .filter(|kv| kv.variant == 1)
            .cloned()
            .collect::<Vec<_>>();

        view! {
            <For
                each=move || { only_labels.clone().into_iter().enumerate() }
                key=|(index, _k)| *index
                children=move |kv| {
                    view! {
                        <div class="d-inline-flex tag">
                            <div class="key text-secondary">{kv.1.get_key()}</div>
                            <div class="value">{kv.1.get_value()}</div>
                        </div>
                    }
                }
            />
        }
    }
}
