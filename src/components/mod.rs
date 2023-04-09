pub mod greeter;
pub mod header;
pub mod main_body;
pub mod panel;
pub mod register;

use cfg_if::cfg_if;
cfg_if! {
    if #[cfg(feature = "ssr")] {
        use leptos::ServerFn;

        pub fn register_server_functions() {
            _ = register::RegisterUser::register();
            _ = register::CheckActivated::register();
        }

    }
}
