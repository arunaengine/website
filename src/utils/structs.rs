use aruna_rust_api::api::storage::{models::v1::{ProjectPermission, User}};
use leptos::RwSignal;
use serde::{Deserialize, Serialize};



#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct SimplePermission {
    pub project_id: String,
    pub permission: i32,
}


#[derive(Clone, PartialEq, Debug, Default, Serialize, Deserialize)]
pub struct UserState {
    pub user_id: String,
    pub display_name: String,
    pub email: String,
    pub is_admin: bool,
    pub permissions: Vec<SimplePermission>
}


impl From<ProjectPermission> for SimplePermission {
    fn from(value: ProjectPermission) -> Self {
        SimplePermission { project_id: value.project_id, permission: value.permission }
    }
}

impl From<User> for UserState {
    fn from(value: User) -> Self {
        UserState { 
            user_id: value.id,
            display_name: value.display_name, 
            email: value.email, 
            is_admin: value.is_admin, 
            permissions: vec![] 
        }
    }
}

#[derive(Clone, Copy)]
pub struct UpdateUser(pub RwSignal<bool>);