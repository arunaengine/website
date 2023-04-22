use anyhow::{anyhow, Result};
use aruna_rust_api::api::storage::models::v1::ProjectPermission;
use aruna_rust_api::api::storage::services::v1::project_service_client;
use aruna_rust_api::api::storage::services::v1::AddUserToProjectRequest;
use aruna_rust_api::api::storage::services::v1::{
    user_service_client, ActivateUserRequest, CreateApiTokenRequest, CreateApiTokenResponse,
    CreateProjectRequest, DeactivateUserRequest, DeleteApiTokenRequest, GetAllUsersRequest,
    GetAllUsersResponse, GetApiTokensRequest, GetApiTokensResponse, GetProjectsRequest,
    GetProjectsResponse, GetUserRequest, GetUserResponse, RegisterUserRequest,
    RegisterUserResponse, RemoveUserFromProjectRequest,
};
use tonic::{
    metadata::{AsciiMetadataKey, AsciiMetadataValue},
    transport::Channel,
};

use super::structs::UserState;

#[allow(dead_code)]
pub fn add_token<T>(mut req: tonic::Request<T>, token: &str) -> tonic::Request<T> {
    let metadata = req.metadata_mut();
    metadata.append(
        AsciiMetadataKey::from_bytes("Authorization".as_bytes()).unwrap(),
        AsciiMetadataValue::try_from(format!("Bearer {}", token)).unwrap(),
    );
    req
}

pub async fn who_am_i(token: &str) -> Result<UserState> {
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

    let mut user_state = UserState::from(response.user.ok_or(anyhow!("Unable to get user_info"))?);
    user_state.permissions = response
        .project_permissions
        .into_iter()
        .map(|e| e.into())
        .collect::<Vec<_>>();

    Ok(user_state)
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

pub async fn aruna_get_all_users(token: &str) -> Result<GetAllUsersResponse> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let get_users_req = tonic::Request::new(GetAllUsersRequest {
        include_permissions: true,
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: GetAllUsersResponse = client
        .get_all_users(add_token(get_users_req, token))
        .await?
        .into_inner();
    Ok(response)
}

pub async fn aruna_activate_user(
    token: &str,
    user_id: &str,
    project_ulid: Option<String>,
    perm: i32,
) -> Result<()> {
    let perm = match project_ulid {
        Some(pul) => {
            if pul.is_empty() {
                None
            } else {
                Some(ProjectPermission {
                    user_id: user_id.to_string(),
                    permission: perm,
                    project_id: pul,
                    service_account: false,
                })
            }
        }
        None => None,
    };
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");

    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let act_user_req = tonic::Request::new(ActivateUserRequest {
        user_id: user_id.to_string(),
        project_perms: perm,
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    client
        .activate_user(add_token(act_user_req, token))
        .await?
        .into_inner();
    Ok(())
}

pub async fn aruna_deactivate_user(token: &str, user_id: &str) -> Result<()> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let dact_user_req = tonic::Request::new(DeactivateUserRequest {
        user_id: user_id.to_string(),
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    client
        .deactivate_user(add_token(dact_user_req, token))
        .await?
        .into_inner();
    Ok(())
}

pub async fn aruna_add_user_to_proj(
    token: &str,
    user_id: &str,
    project_id: &str,
    perm: i32,
) -> Result<()> {
    let projperm = ProjectPermission {
        user_id: user_id.to_string(),
        permission: perm,
        project_id: project_id.to_string(),
        service_account: false,
    };
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let add_user_proj = tonic::Request::new(AddUserToProjectRequest {
        project_id: project_id.to_string(),
        user_permission: Some(projperm),
    });
    let mut client = project_service_client::ProjectServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    client
        .add_user_to_project(add_token(add_user_proj, token))
        .await?
        .into_inner();
    Ok(())
}

pub async fn aruna_remove_user_from_project(
    token: &str,
    user_id: &str,
    project_id: &str,
) -> Result<()> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let remove_user_proj = tonic::Request::new(RemoveUserFromProjectRequest {
        project_id: project_id.to_string(),
        user_id: user_id.to_string(),
    });
    let mut client = project_service_client::ProjectServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    client
        .remove_user_from_project(add_token(remove_user_proj, token))
        .await?
        .into_inner();
    Ok(())
}

pub async fn aruna_create_project(
    token: &str,
    project_name: &str,
    description: &str,
) -> Result<()> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let create_project_req = tonic::Request::new(CreateProjectRequest {
        name: project_name.to_string(),
        description: description.to_string(),
    });
    let mut client = project_service_client::ProjectServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    client
        .create_project(add_token(create_project_req, token))
        .await?
        .into_inner();
    Ok(())
}

pub async fn aruna_get_all_projects(token: &str) -> Result<GetProjectsResponse> {
    let aruna_endpoint = std::env::var("ARUNA_URL").expect("ARUNA_URL client must be set!");
    let endpoint = Channel::from_shared(aruna_endpoint)?;
    let channel = endpoint.connect().await?;
    let create_project_req = tonic::Request::new(GetProjectsRequest {});
    let mut client = project_service_client::ProjectServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let resp: GetProjectsResponse = client
        .get_projects(add_token(create_project_req, token))
        .await?
        .into_inner();
    Ok(resp)
}
