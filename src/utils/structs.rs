use aruna_rust_api::api::storage::models::v1::{ProjectPermission, User};

#[derive(Clone, PartialEq, Debug, Default)]
pub struct UserState {
    pub user: User,
    pub permissions: Vec<ProjectPermission>
}