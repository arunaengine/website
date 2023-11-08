use aruna_rust_api::api::storage::models::v2::PermissionLevel;
use leptos::{view, IntoView};

pub trait GetVisualization {
    fn get_visualization(&self) -> impl IntoView;
}

impl GetVisualization for PermissionLevel {
    fn get_visualization(&self) -> impl IntoView {
        match self {
            PermissionLevel::Read => view! { <span class="status status-green">READ</span> },
            PermissionLevel::Append => view! { <span class="status status-yellow">APPEND</span> },
            PermissionLevel::Write => view! { <span class="status status-orange">WRITE</span> },
            PermissionLevel::Admin => view! { <span class="status status-red">ADMIN</span> },
            _ => view! { <span class="status status-red">UNKNOWN</span> },
        }
    }
}
