use crate::utils::conversion_helpers::{extract_type_id, to_permission_string};
use aruna_rust_api::api::storage::models::v2::User;
use leptos::*;
use leptos_meta::*;

#[server]
pub async fn activate_user(user_id: String) -> Result<(), ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    ConnectionHandler::aruna_activate_user(&token, &user_id)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e)))?;
    Ok(())
}

#[server]
pub async fn deactivate_user(user_id: String) -> Result<(), ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    ConnectionHandler::aruna_deactivate_user(&token, &user_id)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e)))?;
    Ok(())
}

#[server]
pub async fn remove_user_project(
    _user_id: String,
    _project_id: String,
) -> Result<(), ServerFnError> {
    // use crate::utils::aruna_api_handlers::aruna_remove_user_from_project;
    // use actix_session::SessionExt;
    // use actix_web::HttpRequest;
    // let req = use_context::<HttpRequest>().unwrap();

    // let sess = req.get_session();

    // let token = sess
    //     .get::<String>("token")
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
    //     .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;

    // let _resp = aruna_remove_user_from_project(&token, &user_id, &project_id)
    //     .await
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?;

    Ok(())
}

/// Renders the home page of your application.
#[component]
pub fn AdminUser(user: User) -> impl IntoView {
    use crate::components::add_user::*;

    provide_meta_context();

    let is_active = user.active;
    let activate_action = create_server_action::<ActivateUser>();
    let deactivate_action = create_server_action::<DeactivateUser>();
    let remove_user_action = create_server_action::<RemoveUserProject>();

    let get_users: Resource<(), Vec<User>> =
        use_context::<Resource<(), Vec<User>>>().expect("user_state not set");

    let version = RwSignal::new(0);

    create_effect(move |_| {
        if activate_action.version()() + deactivate_action.version()() != version.get() {
            get_users.refetch();
            version.set(activate_action.version()() + deactivate_action.version()());
        }
    });

    let create_active_badges = {
        move || {
            if is_active {
                view! {
                    <span class="status status-green">
                        <span class="status-dot"></span>
                        "active"
                    </span>
                }
            } else {
                view! {
                    <span class="status status-yellow">
                        <span class="status-dot"></span>
                        "inactive"
                    </span>
                }
            }
        }
    };

    let is_admin = user
        .attributes
        .as_ref()
        .map(|a| a.global_admin)
        .unwrap_or_default();
    let is_p_admin = user
        .attributes
        .as_ref()
        .map(|e| e.personal_permissions.clone())
        .unwrap_or_default()
        .iter()
        .any(|u| u.permission_level == 5);

    let create_role_badges = {
        move || {
            if is_admin {
                view! {
                    <span class="status status-red">
                        <span class="status-dot"></span>
                        "admin"
                    </span>
                }
            } else if is_p_admin {
                view! {
                    <span class="status status-purple">
                        <span class="status-dot"></span>
                        "p-admin"
                    </span>
                }
            } else {
                view! {
                    <span class="status status-blue">
                        <span class="status-dot"></span>
                        "user"
                    </span>
                }
            }
        }
    };

    let stored_permission = store_value(
        user.clone()
            .attributes
            .map(|e| e.personal_permissions.clone())
            .unwrap_or_default(),
    );
    let store_user = store_value(user.id.clone());

    view! {
        <AddUserProject user_id=store_user.get_value()/>
        <tr>
            <td>{user.id.clone()}</td>
            <td>{user.display_name.clone()}</td>
            <td>{user.email.clone()}</td>
            <td>{create_active_badges} {create_role_badges}</td>
            <td>
                <div class="d-flex justify-content-end">
                    <a
                        href="#"
                        class="btn btn btn-icon mx-2 btn-sm my-accordion-icon"
                        role="button"
                        aria-label="Button"
                        data-bs-toggle="collapse"
                        data-bs-target=format!(r##"#U{}"##, store_user.get_value())
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
                    {move || {
                        if is_active {
                            view! {
                                <a
                                    href="#"
                                    class="btn btn-danger btn-icon btn-sm"
                                    aria-label="Button"
                                    role="button"
                                    on:click=move |_| {
                                        deactivate_action
                                            .dispatch(DeactivateUser {
                                                user_id: store_user.get_value(),
                                            })
                                    }
                                >

                                    <Suspense fallback=move || {
                                        view! { <div class="spinner-border"></div> }
                                    }>
                                        {move || {
                                            view! {
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    class="icon icon-tabler icon-tabler-minus"
                                                    width="40"
                                                    height="40"
                                                    viewBox="0 0 24 24"
                                                    stroke-width="1"
                                                    stroke="currentColor"
                                                    fill="none"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                >
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                    <path d="M5 12l14 0"></path>
                                                </svg>
                                            }
                                        }}

                                    </Suspense>
                                </a>
                            }
                                .into_view()
                        } else {
                            view! {
                                <a
                                    href="#"
                                    class="btn btn-success btn-icon btn-sm"
                                    aria-label="Button"
                                    role="button"
                                    on:click=move |_| {
                                        activate_action
                                            .dispatch(ActivateUser {
                                                user_id: store_user.get_value(),
                                            })
                                    }
                                >

                                    <Suspense fallback=move || {
                                        view! { <div class="spinner-border"></div> }
                                    }>
                                        {move || {
                                            view! {
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    class="icon icon-tabler icon-tabler-plus"
                                                    width="40"
                                                    height="40"
                                                    viewBox="0 0 24 24"
                                                    stroke-width="1"
                                                    stroke="currentColor"
                                                    fill="none"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                >

                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                    <path d="M12 5l0 14"></path>
                                                    <path d="M5 12l14 0"></path>
                                                </svg>
                                            }
                                                .into_view()
                                        }}

                                    </Suspense>
                                </a>
                            }
                                .into_view()
                        }
                    }}

                </div>
            </td>
        </tr>
        <tr
            class="accordion-collapse collapse"
            id=format!("U{}", store_user.get_value())
            data-bs-parent="#adminTable"
        >
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
                    if !stored_permission.get_value().is_empty() {
                        stored_permission
                            .get_value()
                            .into_iter()
                            .map(|item| {
                                let item_clone = item.clone();
                                let (id, _) = extract_type_id(item.resource_id);
                                let id_clone = id.clone();
                                view! {
                                    <tr colspan="5">
                                        <td>"PID:"</td>
                                        <td>{id.to_string()}</td>
                                        <td>"Role:"</td>
                                        <td>{to_permission_string(item_clone)}</td>
                                        <td>
                                            <div class="d-flex justify-content-end">
                                                <a
                                                    href="#"
                                                    class="btn btn btn-icon mx-2 btn-sm my-accordion-icon text-danger"
                                                    role="button"
                                                    aria-label="Button"
                                                    on:click=move |_| {
                                                        remove_user_action
                                                            .dispatch(RemoveUserProject {
                                                                _user_id: store_user.get_value(),
                                                                _project_id: id_clone.clone(),
                                                            })
                                                    }
                                                >

                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        class="icon icon-tabler icon-tabler-file-minus"
                                                        width="40"
                                                        height="40"
                                                        viewBox="0 0 24 24"
                                                        stroke-width="1"
                                                        stroke="currentColor"
                                                        fill="none"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                    >
                                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                        <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                                                        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                                                        <path d="M9 14l6 0"></path>
                                                    </svg>
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                }
                            })
                            .collect::<Vec<_>>()
                            .into_view()
                    } else {
                        view! {
                            <td colspan="5" class="text-center">
                                "Looks like this user is currently not member in any project!"
                            </td>
                        }
                            .into_view()
                    }
                }}

            </Transition>
        </tr>
    }
}
