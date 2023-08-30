use leptos::*;
use leptos_meta::*;

use crate::utils::structs::{TokenStats, UpdateTokens, UserState};

#[server(DeleteToken, "/web")]
pub async fn delete_token(_token_id: String) -> Result<(), ServerFnError> {
    // use crate::utils::aruna_api_handlers::aruna_delete_api_token;
    // use actix_session::SessionExt;
    // use actix_web::HttpRequest;
    // let req = use_context::<HttpRequest>()
    //     .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;

    // let sess = req.get_session();

    // let token = sess
    //     .get::<String>("token")
    //     .map_err(|_| {
    //         log::debug!("Unable to query token from session 1");
    //         ServerFnError::Request("Invalid request".to_string())
    //     })?
    //     .ok_or_else(|| {
    //         log::debug!("Unable to query token from session 1");
    //         ServerFnError::Request("Invalid request".to_string())
    //     })?;

    // _ = aruna_delete_api_token(token_id.clone(), &token)
    //     .await
    //     .map_err(|_| {
    //         log::debug!("Unable to query token from session 1");
    //         ServerFnError::Request("Invalid request".to_string())
    //     })?;

    Ok(())
}

/// Renders the home page of your application.
#[component]
pub fn Token(token_info: TokenStats) -> impl IntoView {
    provide_meta_context();

    let token_id = store_value(token_info.id.to_string());

    let update_tokens = use_context::<UpdateTokens>().expect("user_state not set");

    let (deleting, set_deleting) = create_signal("".to_string());

    let dispatch_delete = create_resource(deleting, move |del| async move {
        // this is the ServerFn that is called by the GetUser Action above
        if !del.is_empty() {
            delete_token(del).await.ok();
            update_tokens.0.update(move |e| *e = !*e)
        }
    });

    view! {
        <tr>
            <td>{token_info.id.clone()}</td>
            <td>{token_info.name.clone()}</td>
            <td>{token_info.used_at.clone()}</td>
            <td>
                <div class="d-flex justify-content-end">
                    <a
                        href="#"
                        class="btn btn btn-icon mx-2 btn-sm my-accordion-icon"
                        role="button"
                        aria-label="Button"
                        data-bs-toggle="collapse"
                        data-bs-target=format!(r##"#S{}"##, token_info.id)
                        aria-expanded="false"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-arrow-down"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            fill="none"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 5l0 14"></path>
                            <path d="M18 13l-6 6"></path>
                            <path d="M6 13l6 6"></path>
                        </svg>
                    </a>
                    <a
                        href="#"
                        class="btn btn-danger btn-icon btn-sm"
                        aria-label="Button"
                        role="button"
                        on:click=move |_| { set_deleting.set(token_id.get_value()) }
                    >
                        <Suspense fallback=move || {
                            view! {
                                ,
                                <div class="spinner-border"></div>
                            }
                        }>
                            {move || {
                                let _ = dispatch_delete.get();
                                view! {
                                    ,
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="icon icon-tabler icon-tabler-trash"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        stroke-width="2"
                                        stroke="currentColor"
                                        fill="none"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M4 7l16 0"></path>
                                        <path d="M10 11l0 6"></path>
                                        <path d="M14 11l0 6"></path>
                                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path>
                                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path>
                                    </svg>
                                }
                            }}

                        </Suspense>
                    </a>
                </div>
            </td>
        </tr>
        <tr
            class="accordion-collapse collapse"
            id=format!("S{}", token_info.id.clone())
            data-bs-parent="#tokenTable"
        >
            <td colspan="4">
                <div class="card card-borderless">
                    <div class="card-body accordion-body">
                        <div class="datagrid">
                            <div class="datagrid-item">
                                <div class="datagrid-title">"ID"</div>
                                <div class="datagrid-content">{token_info.id.clone()}</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Name"</div>
                                <div class="datagrid-content">{token_info.name.clone()}</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Type"</div>
                                <div class="datagrid-content">
                                    {token_info.token_type.get_type_variant()}
                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Target"</div>
                                <div class="datagrid-content">
                                    {token_info.token_type.get_target_id()}
                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Permission level"</div>
                                <div class="datagrid-content">
                                    {token_info.token_type.get_permission()}
                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Created at"</div>
                                <div class="datagrid-content">{token_info.created_at}</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Expires at"</div>
                                <div class="datagrid-content">{token_info.expires_at}</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Last used"</div>
                                <div class="datagrid-content">{token_info.used_at}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    }
}

/// Renders the home page of your application.
#[component]
pub fn Session(token_info: TokenStats) -> impl IntoView {
    provide_meta_context();

    use crate::components::alert_modal::*;

    let get_user = use_context::<Resource<bool, Option<UserState>>>().expect("user_state not set");

    let session_id = move || {
        get_user
            .get()
            .unwrap_or_default()
            .unwrap_or_default()
            .session_id
    };

    let token_id = store_value(token_info.id.to_string());

    let is_current = move || session_id() == token_id();

    let update_tokens = use_context::<UpdateTokens>().expect("user_state not set");

    let (deleting, set_deleting) = create_signal("".to_string());
    let (blocking, set_blocking) = create_signal(true);

    let dispatch_delete = create_resource(blocking, move |del| async move {
        // this is the ServerFn that is called by the GetUser Action above
        if !deleting().is_empty() && !del {
            delete_token(deleting()).await.ok();
            update_tokens.0.update(move |e| *e = !*e)
        }
    });

    create_effect(move |_| {
        if is_current() && !deleting().is_empty() && !blocking() && dispatch_delete.get().is_some()
        {
            let _ = window().location().set_href("/logout");
        }
    });

    let message = if is_current() {
        "Are you sure to delete the session that is currently in use ? This will automatically forward you to the logout page."
    } else {
        "Do you really want to delete this session ?"
    };

    view! {
        <AlertModal
            header="Deleting session".to_string()
            message=message.to_string()
            modal_id=format!("mod-{}", token_id.get_value())
            action_name="Delete".to_string()
            action=move |_| {
                set_deleting.set(token_id.get_value());
                set_blocking.set(false)
            }
        />

        <tr>
            <td>{token_info.id.clone()}</td>
            <td>{token_info.expires_at}</td>
            <td>{token_info.used_at}</td>
            <td>
                <div class="d-flex justify-content-end">
                    {move || {
                        if is_current() {
                            view! {
                                <span class="status status-green me-2">
                                    <span class="status-dot status-dot-animated"></span>
                                    "current"
                                </span>
                            }
                                .into_view()
                        } else {
                            ().into_view()
                        }
                    }}
                    <a
                        href="#"
                        class="btn btn-danger btn-icon btn-sm"
                        aria-label="Button"
                        role="button"
                        data-bs-toggle="modal"
                        data-bs-target=format!("#mod-{}", token_id.get_value())
                    >
                        <Suspense fallback=move || {
                            view! {
                                ,
                                <div class="spinner-border"></div>
                            }
                        }>
                            {move || {
                                let _ = dispatch_delete.get();
                                view! {
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="icon icon-tabler icon-tabler-trash"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        stroke-width="2"
                                        stroke="currentColor"
                                        fill="none"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M4 7l16 0"></path>
                                        <path d="M10 11l0 6"></path>
                                        <path d="M14 11l0 6"></path>
                                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path>
                                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path>
                                    </svg>
                                }
                            }}

                        </Suspense>

                    </a>
                </div>
            </td>
        </tr>
    }
}
