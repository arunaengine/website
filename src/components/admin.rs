use leptos::*;
use leptos_meta::*;
use crate::utils::structs::{UserState, UpdateAdmin};

#[server(GetUsers, "/web")]
pub async fn get_users(
    #[allow(unused_variables)] cx: Scope,
) -> Result<Vec<UserState>, ServerFnError> {
    use crate::utils::aruna_api_handlers::aruna_get_api_tokens;
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx)
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;

    let sess = req.get_session();

    let token = sess
        .get::<String>("token")
        .map_err(|_| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?
        .ok_or_else(|| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?;

    let result = aruna_get_all_users(&token).await.map_err(|_| {
        log::debug!("Unable to query token from session 1");
        ServerFnError::Request("Invalid request".to_string())
    })?;

    Ok(result
        .token
        .into_iter()
        .map(UserState::from)
        .collect::<Vec<UserState>>())
}

#[component]
pub fn AdminOverview(cx: Scope) -> impl IntoView {

    use crate::components::user::*;

    provide_meta_context(cx);

    let get_user =
    use_context::<Resource<bool, Option<UserState>>>(cx).expect("user_state not set");


    let is_admin = create_memo(cx, move |_| {
        get_user.read(cx).unwrap_or_default().unwrap_or_default().is_admin
    });

    if is_admin() == false {
        #[cfg(not(feature = "ssr"))]
        window().location().set_href("/").unwrap();
    }

    let update_admin: UpdateAdmin = UpdateAdmin(create_rw_signal(cx, true));

    let get_users_res = create_resource(cx, update_admin.0, move |_| async move {
        // this is the ServerFn that is called by the GetUser Action above
        get_users(cx).await.ok()
    });

    update_admin.0.update(|e| *e = !*e);

    provide_context(cx, update_admin);


    let user_states = move || get_users_res.read(cx).flatten().unwrap_or_default();

    view! {cx,
    <div class="page-header d-print-none my-3">
        <div class="container-xl">
        <div class="row g-2 align-items-center">
            <div class="col">
            <h2 class="page-title">
                "Admin"
            </h2>
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
                        <Transition fallback=move || view! { cx, <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                        {
                            move || if !user_states().is_empty() {
                                user_states().into_iter()
                                .map(|item| view! {
                                    cx,
                                    <AdminUser user=item/>
                                })
                                .collect::<Vec<_>>().into_view(cx) 
                            }else{
                                view!{cx, <tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view(cx)
                            }
                        }
                        </Transition>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    }
}
