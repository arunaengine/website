use anyhow::{anyhow, Result};
use aruna_rust_api::api::storage::models::v2::generic_resource::Resource;
use aruna_rust_api::api::storage::models::v2::permission::ResourceId;
use aruna_rust_api::api::storage::models::v2::{DataClass, Permission, User};
use aruna_rust_api::api::storage::services::v2::{
    collection_service_client, dataset_service_client, object_service_client,
    project_service_client, search_service_client, user_service_client, ActivateUserRequest,
    CreateApiTokenRequest, CreateApiTokenResponse, CreateCollectionRequest, CreateDatasetRequest,
    CreateObjectRequest, DeactivateUserRequest, DeleteApiTokenRequest, GetAllUsersRequest,
    GetAllUsersResponse, GetApiTokensRequest, GetApiTokensResponse, GetResourceRequest,
    GetResourcesRequest, GetUserRequest, RegisterUserRequest, RegisterUserResponse,
    ResourceWithPermission, SearchResourcesRequest, SearchResourcesResponse,
};
use tonic::{
    metadata::{AsciiMetadataKey, AsciiMetadataValue},
    transport::Channel,
    transport::ClientTlsConfig,
};

use super::structs::{ResourceType, SearchQuery, WhoamiResponse};

pub struct ConnectionHandler {}

impl ConnectionHandler {
    #[allow(dead_code)]
    pub fn add_token<T>(mut req: tonic::Request<T>, token: &str) -> tonic::Request<T> {
        let metadata = req.metadata_mut();
        metadata.append(
            AsciiMetadataKey::from_bytes("Authorization".as_bytes()).unwrap(),
            AsciiMetadataValue::try_from(format!("Bearer {}", token)).unwrap(),
        );
        req
    }

    async fn get_channel() -> Result<Channel> {
        let aruna_endpoint = std::env::var("ARUNA_URL")?;
        let endpoint = if aruna_endpoint.starts_with("https") {
            Channel::from_shared(aruna_endpoint.clone())
                .map_err(|_| tonic::Status::internal("Could not connect to Dataproxy"))?
                .tls_config(ClientTlsConfig::new())
                .map_err(|_| tonic::Status::internal("Could not connect to Dataproxy"))?
        } else {
            Channel::from_shared(aruna_endpoint.clone())
                .map_err(|_| tonic::Status::internal("Could not connect to Dataproxy"))?
        };
        Ok(endpoint.connect().await?)
    }

    pub async fn aruna_who_am_i(token: &str) -> WhoamiResponse {
        let Ok(channel) = Self::get_channel().await else {
            return WhoamiResponse::Error("Unable to connect to ep".to_string());
        };
        let get_request = tonic::Request::new(GetUserRequest {
            user_id: "".to_string(),
        });
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        match client.get_user(Self::add_token(get_request, token)).await {
            Ok(i) => match i.into_inner().user {
                Some(u) => return WhoamiResponse::User(u),
                None => return WhoamiResponse::NotRegistered,
            },
            Err(e) => {
                if e.message().contains("Not registered") {
                    return WhoamiResponse::NotRegistered;
                } else {
                    return WhoamiResponse::Error(e.message().to_string());
                }
            }
        }
    }

    pub async fn aruna_register_user(
        token: &str,
        display_name: &str,
        email: &str,
        project: &str,
    ) -> Result<String> {
        let channel = Self::get_channel().await?;
        let register_req = tonic::Request::new(RegisterUserRequest {
            display_name: display_name.to_string(),
            email: email.to_string(),
            project: project.to_string(),
        });
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        let response: RegisterUserResponse = client
            .register_user(Self::add_token(register_req, token))
            .await?
            .into_inner();
        Ok(response.user_id)
    }

    pub async fn aruna_create_token(
        req: CreateApiTokenRequest,
        token: &str,
    ) -> Result<CreateApiTokenResponse> {
        let channel = Self::get_channel().await?;
        let create_token_req = tonic::Request::new(req);
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        let response: CreateApiTokenResponse = client
            .create_api_token(Self::add_token(create_token_req, token))
            .await?
            .into_inner();
        Ok(response)
    }

    pub async fn aruna_get_api_tokens(token: &str) -> Result<GetApiTokensResponse> {
        let channel = Self::get_channel().await?;
        let get_tokens_req = tonic::Request::new(GetApiTokensRequest {});
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        let response: GetApiTokensResponse = client
            .get_api_tokens(Self::add_token(get_tokens_req, token))
            .await?
            .into_inner();
        Ok(response)
    }

    pub async fn aruna_delete_api_token(token_id: String, token: &str) -> Result<()> {
        let channel = Self::get_channel().await?;
        let delete_tokens_req = tonic::Request::new(DeleteApiTokenRequest { token_id });
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        _ = client
            .delete_api_token(Self::add_token(delete_tokens_req, token))
            .await?
            .into_inner();
        Ok(())
    }
    pub async fn aruna_get_resource(
        token: Option<String>,
        resource_id: String,
    ) -> Result<ResourceWithPermission> {
        leptos::logging::log!("Starting GetResource call");
        let channel = Self::get_channel().await?;
        let mut client = search_service_client::SearchServiceClient::new(channel);
        let req = tonic::Request::new(GetResourceRequest { resource_id });
        let result = match token {
            Some(t) => client
                .get_resource(Self::add_token(req, &t))
                .await?
                .into_inner(),
            None => client.get_resource(req).await?.into_inner(),
        };
        leptos::logging::log!("GetResource result: {result:?}");
        let res = result.resource.expect("Resource not found");
        Ok(res)
    }
    pub async fn aruna_get_resources(
        token: Option<&str>,
        resource_ids: Vec<String>,
    ) -> Result<Vec<Resource>> {
        let channel = Self::get_channel().await?;
        let mut client = search_service_client::SearchServiceClient::new(channel);
        let req = tonic::Request::new(GetResourcesRequest { resource_ids });
        let result = match token {
            Some(t) => client
                .get_resources(Self::add_token(req, t))
                .await?
                .into_inner(),
            None => client.get_resources(req).await?.into_inner(),
        };
        let res = result
            .resources
            .into_iter()
            .map(|res| res.resource.unwrap().resource.unwrap())
            .collect();

        Ok(res)
    }

    pub async fn get_owned_resources(
        perms: Vec<Permission>,
        token: String,
    ) -> Result<Vec<Resource>> {
        let channel = Self::get_channel().await?;
        let mut client = search_service_client::SearchServiceClient::new(channel);
        let resource_ids = perms
            .into_iter()
            .filter_map(
                |Permission {
                     resource_id,
                     permission_level,
                 }| {
                    if permission_level > 3 {
                        match resource_id {
                            Some(id) => match id {
                                ResourceId::ProjectId(id) => Some(id),
                                ResourceId::CollectionId(id) => Some(id),
                                ResourceId::DatasetId(id) => Some(id),
                                ResourceId::ObjectId(id) => Some(id),
                            },
                            None => None,
                        }
                    } else {
                        None
                    }
                },
            )
            .collect();
        let req = tonic::Request::new(GetResourcesRequest { resource_ids });
        let result: Vec<Resource> = client
            .get_resources(Self::add_token(req, &token))
            .await?
            .into_inner()
            .resources
            .into_iter()
            .map(|res| res.resource.unwrap().resource.unwrap())
            .collect();
        leptos::logging::log!("API Response: {result:?}");
        Ok(result.clone())
    }

    pub async fn search(
        token: Option<String>,
        query: SearchQuery,
    ) -> Result<SearchResourcesResponse> {
        let channel = Self::get_channel().await?;
        let mut client = search_service_client::SearchServiceClient::new(channel);
        let req = tonic::Request::new(SearchResourcesRequest {
            query: query.query,
            filter: query.filter,
            limit: query.limit,
            offset: query.offset,
        });
        leptos::logging::log!("SearchResourceRequest: {req:?}");
        let result = match token {
            Some(t) => client
                .search_resources(Self::add_token(req, &t))
                .await?
                .into_inner(),
            None => client.search_resources(req).await?.into_inner(),
        };
        leptos::logging::log!("SearchResource result: {result:?}");
        Ok(result)
    }

    pub async fn aruna_create_resource(
        token: &str,
        name: &str,
        description: &str,
        res_type: ResourceType,
        parent: Option<String>,
        parent_type: Option<ResourceType>,
    ) -> Result<()> {
        let channel = Self::get_channel().await?;
        match res_type {
            ResourceType::Project => {
                let mut client = project_service_client::ProjectServiceClient::new(channel);
                let request = tonic::Request::new(
                    aruna_rust_api::api::storage::services::v2::CreateProjectRequest {
                        name: name.to_string(),
                        description: description.to_string(),
                        data_class: DataClass::Public as i32,
                        ..Default::default()
                    },
                );
                // Send the request to the AOS instance gRPC gateway
                client
                    .create_project(Self::add_token(request, token))
                    .await?
                    .into_inner();
            }
            ResourceType::Collection => {
                let parent_id = match parent {
                    Some(id) => id,
                    None => return Err(anyhow!("No id provided")),
                };
                let parent = match parent_type {
                    Some(p) => match p {
                        ResourceType::Project => Some(aruna_rust_api::api::storage::services::v2::create_collection_request::Parent::ProjectId(parent_id)),
                        _ => return Err(anyhow!("Only projects are valid parents for collections")),
                    },
                    None => return Err(anyhow!("No parent type provided")),

                };
                let mut client = collection_service_client::CollectionServiceClient::new(channel);
                let request = tonic::Request::new(CreateCollectionRequest {
                    name: name.to_string(),
                    description: description.to_string(),
                    data_class: DataClass::Public as i32, // TODO!
                    parent,
                    ..Default::default()
                });
                client
                    .create_collection(Self::add_token(request, token))
                    .await?
                    .into_inner();
            }
            ResourceType::Dataset => {
                let parent_id = match parent {
                    Some(id) => id,
                    None => return Err(anyhow!("No id provided")),
                };
                let parent = match parent_type {
                    Some(p) => match p {
                        ResourceType::Project => Some(aruna_rust_api::api::storage::services::v2::create_dataset_request::Parent::ProjectId(parent_id)),
                        ResourceType::Collection => Some(aruna_rust_api::api::storage::services::v2::create_dataset_request::Parent::CollectionId(parent_id)),
                        _ => return Err(anyhow!("Only projects are valid parents for collections")),
                    },
                    None => return Err(anyhow!("No parent type provided")),

                };
                let mut client = dataset_service_client::DatasetServiceClient::new(channel);
                let request = tonic::Request::new(CreateDatasetRequest {
                    name: name.to_string(),
                    description: description.to_string(),
                    data_class: DataClass::Public as i32, // TODO!
                    parent,
                    ..Default::default()
                });
                client
                    .create_dataset(Self::add_token(request, token))
                    .await?
                    .into_inner();
            }
            ResourceType::Object => {
                let parent_id = match parent {
                    Some(id) => id,
                    None => return Err(anyhow!("No id provided")),
                };
                let parent = match parent_type {
                    Some(p) => match p {
                        ResourceType::Project => Some(aruna_rust_api::api::storage::services::v2::create_object_request::Parent::ProjectId(parent_id)),
                        ResourceType::Collection => Some(aruna_rust_api::api::storage::services::v2::create_object_request::Parent::CollectionId(parent_id)),
                        ResourceType::Dataset=> Some(aruna_rust_api::api::storage::services::v2::create_object_request::Parent::DatasetId(parent_id)),
                        _ => return Err(anyhow!("Objects ")),
                    },
                    None => return Err(anyhow!("No parent type provided")),

                };
                let mut client = object_service_client::ObjectServiceClient::new(channel);
                let request = tonic::Request::new(CreateObjectRequest {
                    name: name.to_string(),
                    description: description.to_string(),
                    data_class: DataClass::Public as i32, // TODO!
                    parent,
                    ..Default::default()
                });
                client
                    .create_object(Self::add_token(request, token))
                    .await?
                    .into_inner();
            }
        }
        Ok(())
    }

    pub async fn aruna_get_all_users(token: &str) -> Result<Vec<User>> {
        let channel = Self::get_channel().await?;
        let get_users_req = tonic::Request::new(GetAllUsersRequest {});
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        let response: GetAllUsersResponse = client
            .get_all_users(Self::add_token(get_users_req, token))
            .await?
            .into_inner();
        Ok(response.user)
    }

    pub async fn aruna_activate_user(token: &str, user_id: &str) -> Result<()> {
        let channel = Self::get_channel().await?;
        let act_user_req = tonic::Request::new(ActivateUserRequest {
            user_id: user_id.to_string(),
        });
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        client
            .activate_user(Self::add_token(act_user_req, token))
            .await?
            .into_inner();
        Ok(())
    }

    pub async fn aruna_deactivate_user(token: &str, user_id: &str) -> Result<()> {
        let channel = Self::get_channel().await?;
        let deact_user_req = tonic::Request::new(DeactivateUserRequest {
            user_id: user_id.to_string(),
        });
        let mut client = user_service_client::UserServiceClient::new(channel);
        // Send the request to the AOS instance gRPC gateway
        client
            .deactivate_user(Self::add_token(deact_user_req, token))
            .await?
            .into_inner();
        Ok(())
    }
}

// pub async fn aruna_add_user_to_proj(
//     token: &str,
//     user_id: &str,
//     project_id: &str,
//     perm: i32,
// ) -> Result<()> {
//     let projperm = ProjectPermission {
//         user_id: user_id.to_string(),
//         permission: perm,
//         project_id: project_id.to_string(),
//         service_account: false,
//     };
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let add_user_proj = tonic::Request::new(AddUserToProjectRequest {
//         project_id: project_id.to_string(),
//         user_permission: Some(projperm),
//     });
//     let mut client = project_service_client::ProjectServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     client
//         .add_user_to_project(add_token(add_user_proj, token))
//         .await?
//         .into_inner();
//     Ok(())
// }

// pub async fn aruna_remove_user_from_project(
//     token: &str,
//     user_id: &str,
//     project_id: &str,
// ) -> Result<()> {
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let remove_user_proj = tonic::Request::new(RemoveUserFromProjectRequest {
//         project_id: project_id.to_string(),
//         user_id: user_id.to_string(),
//     });
//     let mut client = project_service_client::ProjectServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     client
//         .remove_user_from_project(add_token(remove_user_proj, token))
//         .await?
//         .into_inner();
//     Ok(())
// }

// pub async fn aruna_get_all_projects(token: &str) -> Result<GetProjectsResponse> {
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let create_project_req = tonic::Request::new(GetProjectsRequest {});
//     let mut client = project_service_client::ProjectServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     let resp: GetProjectsResponse = client
//         .get_projects(add_token(create_project_req, token))
//         .await?
//         .into_inner();
//     Ok(resp)
// }
