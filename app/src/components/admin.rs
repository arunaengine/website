use crate::utils::structs::WhoamiResponse;
use aruna_rust_api::api::storage::models::v2::User;
use leptos::*;
use leptos_meta::*;
use leptos_router::{use_navigate, NavigateOptions};

#[server]
pub async fn get_users() -> Result<Vec<User>, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    return Ok(ConnectionHandler::aruna_get_all_users(&token)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e.to_string())))?);
}

#[component]
pub fn AdminOverview() -> impl IntoView {
    use crate::components::user::*;

    provide_meta_context();

    let get_user = use_context::<Resource<(), WhoamiResponse>>().expect("user_state not set");

    let is_admin = create_memo(move |_| {
        get_user
            .get()
            .map(|x| {
                x.maybe_user()
                    .unwrap_or_default()
                    .attributes
                    .unwrap_or_default()
                    .global_admin
            })
            .unwrap_or_default()
    });

    let get_users_res = create_local_resource(
        move || (),
        move |_| async move { get_users().await.unwrap_or_default() },
    );

    let navigate = use_navigate();

    let should_redirect = move || {
        if let Some(r) = get_users_res.get() {
            r.is_empty() || !is_admin.get()
        } else {
            false || !is_admin.get()
        }
    };

    provide_context(get_users_res);

    let user_states = move || get_users_res.get().unwrap_or_default();

    view! {
        {move || {
            if should_redirect() {
                navigate("/", NavigateOptions::default());
            }
        }}

        <div class="page-header d-print-none my-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <div class="page-pretitle text-start">Global Permissions</div>
                        <h2 class="page-title">Users</h2>
                    </div>
                </div>
            </div>
        </div>
        <div class="container-xl mt-2 text-start">
            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter card-table" id="adminTable">
                        <thead>
                            <tr>
                                <th>"Id"</th>
                                <th>"Name"</th>
                                <th>"Email"</th>
                                <th>"Status"</th>
                                <th class="w-1">"Actions"</th>
                            </tr>
                        </thead>
                        <tbody>
                            <Transition fallback=move || {
                                view! {
                                    <tr>
                                        <td colspan="5" class="text-center">
                                            <div class="spinner-border"></div>
                                        </td>
                                    </tr>
                                }
                            }>

                                {move || {
                                    if !user_states().is_empty() {
                                        user_states()
                                            .into_iter()
                                            .map(|item| view! { <AdminUser user=item/> })
                                            .collect::<Vec<_>>()
                                            .into_view()
                                    } else {
                                        view! {
                                            <tr>
                                                <td colspan="5" class="text-center">
                                                    "Looks like you are currently not associated with any project!"
                                                </td>
                                            </tr>
                                        }
                                            .into_view()
                                    }
                                }}

                            </Transition>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    }
}
