use anyhow::Result;
use aruna_rust_api::api::storage::services::v1::{user_service_client, GetUserRequest};
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

pub async fn who_am_i(token: &str) -> Result<()> {
    let endpoint = Channel::from_shared("https://<URL-To-AOS-Instance-gRPC-Gateway>")?;
    let channel = endpoint.connect().await?;
    let get_request = tonic::Request::new(GetUserRequest {
        user_id: "".to_string(),
    });
    let mut client = user_service_client::UserServiceClient::new(channel);
    // Send the request to the AOS instance gRPC gateway
    let response = client
        .get_user(add_token(get_request, token))
        .await?
        .into_inner();

    dbg!(response);
    Ok(())
}
