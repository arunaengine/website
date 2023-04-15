use anyhow::{anyhow, Result};
use aruna_rust_api::api::storage::services::v1::{
    user_service_client, CreateApiTokenRequest, CreateApiTokenResponse, DeleteApiTokenRequest,
    GetApiTokensRequest, GetApiTokensResponse, GetUserRequest, GetUserResponse,
    RegisterUserRequest, RegisterUserResponse, GetAllUsersRequest, GetAllUsersResponse
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
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
    let endpoint = Channel::from_shared("http://0.0.0.0:50051")?;
    let channel = endpoint.connect().await?;
    let get_users_req = tonic::Request::new(GetAllUsersRequest {});
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response: GetAllUsersResponse = client
        .get_all_users(add_token(get_users_req, token))
        .await?
        .into_inner();
    Ok(response)
}
