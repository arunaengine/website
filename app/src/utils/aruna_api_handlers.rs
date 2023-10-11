use anyhow::{anyhow, Result};
use aruna_rust_api::api::storage::models::v2::generic_resource::Resource;
use aruna_rust_api::api::storage::models::v2::permission::ResourceId;
use aruna_rust_api::api::storage::models::v2::{Permission, User};
//use aruna_rust_api::api::storage::services::v2::project_service_client;
use aruna_rust_api::api::storage::services::v2::{
    search_service_client, user_service_client, CreateApiTokenRequest, CreateApiTokenResponse,
    DeleteApiTokenRequest, GetApiTokensRequest, GetApiTokensResponse, GetResourceRequest,
    GetResourcesRequest, GetUserRequest, GetUserResponse, RegisterUserRequest,
    RegisterUserResponse, ResourceWithPermission, SearchResourcesRequest,
};
use tonic::{
    metadata::{AsciiMetadataKey, AsciiMetadataValue},
    transport::Channel,
};

#[allow(dead_code)]
pub fn add_token<T>(mut req: tonic::Request<T>, token: &str) -> tonic::Request<T> {
    let metadata = req.metadata_mut();
    metadata.append(
        AsciiMetadataKey::from_bytes("Authorization".as_bytes()).unwrap(),
        AsciiMetadataValue::try_from(format!("Bearer {}", token)).unwrap(),
    );
    req
}

pub async fn who_am_i(token: &str) -> Result<User> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let get_request = tonic::Request::new(GetUserRequest {
        user_id: "".to_string(),
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: GetUserResponse = client
        .get_user(add_token(get_request, token))
        .await?
        .into_inner();
    response.user.ok_or(anyhow!("No user found"))
}

pub async fn aruna_register_user(
    token: &str,
    display_name: &str,
    email: &str,
    project: &str,
) -> Result<String> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let register_req = tonic::Request::new(RegisterUserRequest {
        display_name: display_name.to_string(),
        email: email.to_string(),
        project: project.to_string(),
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: RegisterUserResponse = client
        .register_user(add_token(register_req, token))
        .await?
        .into_inner();
    Ok(response.user_id)
}

pub async fn aruna_create_token(
    req: CreateApiTokenRequest,
    token: &str,
) -> Result<CreateApiTokenResponse> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let create_token_req = tonic::Request::new(req);
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: CreateApiTokenResponse = client
        .create_api_token(add_token(create_token_req, token))
        .await?
        .into_inner();
    Ok(response)
}

pub async fn aruna_get_api_tokens(token: &str) -> Result<GetApiTokensResponse> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let get_tokens_req = tonic::Request::new(GetApiTokensRequest {});
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: GetApiTokensResponse = client
        .get_api_tokens(add_token(get_tokens_req, token))
        .await?
        .into_inner();
    Ok(response)
}

pub async fn aruna_delete_api_token(token_id: String, token: &str) -> Result<()> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let delete_tokens_req = tonic::Request::new(DeleteApiTokenRequest { token_id });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    _ = client
        .delete_api_token(add_token(delete_tokens_req, token))
        .await?
        .into_inner();
    Ok(())
}
pub async fn aruna_get_resource(
    token: Option<String>,
    resource_id: String,
) -> Result<ResourceWithPermission> {
    leptos::logging::log!("Starting GetResource call");
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let mut client = search_service_client::SearchServiceClient::new(channel);
    let req = tonic::Request::new(GetResourceRequest { resource_id });
    let result = match token {
        Some(t) => client.get_resource(add_token(req, &t)).await?.into_inner(),
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
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let mut client = search_service_client::SearchServiceClient::new(channel);
    let req = tonic::Request::new(GetResourcesRequest { resource_ids });
    let result = match token {
        Some(t) => client.get_resources(add_token(req, t)).await?.into_inner(),
        None => client.get_resources(req).await?.into_inner(),
    };
    let res = result
        .resources
        .into_iter()
        .map(|res| res.resource.unwrap().resource.unwrap())
        .collect();

    Ok(res)
}

pub async fn get_owned_resources(perms: Vec<Permission>, token: String) -> Result<Vec<Resource>> {
    leptos::logging::log!("Permissions: {perms:?}");
    leptos::logging::log!("Token: {token}");
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
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
        .get_resources(add_token(req, &token))
        .await?
        .into_inner()
        .resources
        .into_iter()
        .map(|res| res.resource.unwrap().resource.unwrap())
        .collect();
    leptos::logging::log!("API Response: {result:?}");
    Ok(result.clone())
}

// pub async fn aruna_get_all_users(token: &str) -> Result<GetAllUsersResponse> {
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let get_users_req = tonic::Request::new(GetAllUsersRequest {
//         include_permissions: true,
//     });
//     let mut client = user_service_client::UserServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     let response: GetAllUsersResponse = client
//         .get_all_users(add_token(get_users_req, token))
//         .await?
//         .into_inner();
//     Ok(response)
// }

// pub async fn aruna_activate_user(
//     token: &str,
//     user_id: &str,
//     project_ulid: Option<String>,
//     perm: i32,
// ) -> Result<()> {
//     let perm = match project_ulid {
//         Some(pul) => {
//             if pul.is_empty() {
//                 None
//             } else {
//                 Some(ProjectPermission {
//                     user_id: user_id.to_string(),
//                     permission: perm,
//                     project_id: pul,
//                     service_account: false,
//                 })
//             }
//         }
//         None => None,
//     };
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");

//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let act_user_req = tonic::Request::new(ActivateUserRequest {
//         user_id: user_id.to_string(),
//         project_perms: perm,
//     });
//     let mut client = user_service_client::UserServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     client
//         .activate_user(add_token(act_user_req, token))
//         .await?
//         .into_inner();
//     Ok(())
// }

// pub async fn aruna_deactivate_user(token: &str, user_id: &str) -> Result<()> {
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let dact_user_req = tonic::Request::new(DeactivateUserRequest {
//         user_id: user_id.to_string(),
//     });
//     let mut client = user_service_client::UserServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     client
//         .deactivate_user(add_token(dact_user_req, token))
//         .await?
//         .into_inner();
//     Ok(())
// }

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

// pub async fn aruna_create_project(
//     token: &str,
//     project_name: &str,
//     description: &str,
// ) -> Result<()> {
//     let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
//     let endpoint = Channel::from_shared(aruna_endpoint)?;
//     let channel = endpoint.connect().await?;
//     let create_project_req = tonic::Request::new(CreateProjectRequest {
//         name: project_name.to_string(),
//         description: description.to_string(),
//     });
//     let mut client = project_service_client::ProjectServiceClient::new(channel);
//     // Send the request to the AOS instance gRPC gateway
//     client
//         .create_project(add_token(create_project_req, token))
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
