use anyhow::{Result, anyhow};
use aruna_rust_api::api::storage::services::v1::{
    user_service_client, GetUserRequest, RegisterUserRequest, RegisterUserResponse, GetUserResponse,
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
    user_state.permissions = response.project_permissions.into_iter().map(|e| e.into()).collect::<Vec<_>>();

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
