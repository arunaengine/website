pub mod admin;
pub mod create_token;
pub mod header;
pub mod main_body;
pub mod panel;
pub mod panel_nav;
pub mod project;
pub mod projects;
pub mod register;
pub mod token;
pub mod tokens;
pub mod alert_modal;
pub mod user;

use cfg_if::cfg_if;

cfg_if! {
    if #[cfg(feature = "ssr")] {
        use leptos::ServerFn;
        use crate::app::GetUserInfo;

        pub fn register_server_functions() {
            _ = register::RegisterUser::register();
            _ = register::CheckActivated::register();
            _ = GetUserInfo::register();
            _ = create_token::CreateTokenServer::register();
            _ = tokens::GetTokens::register();
            _ = token::DeleteToken::register();
        }

    }
}
