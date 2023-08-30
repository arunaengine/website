use crate::utils::structs::{UpdateAdmin, UserState};
use leptos::*;
use leptos_meta::*;

#[server(DeactivateUser, "/web")]
pub async fn deactivate_user(_user_id: String) -> Result<(), ServerFnError> {
    // use crate::utils::aruna_api_handlers::aruna_deactivate_user;
    // use actix_session::SessionExt;
    // use actix_web::HttpRequest;
    // let req = use_context::<HttpRequest>().unwrap();

    // let sess = req.get_session();

    // let token = sess
    //     .get::<String>("token")
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
    //     .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;

    // let _resp = aruna_deactivate_user(&token, &user_id)
    //     .await
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?;

    Ok(())
}

#[server(RemoveUser, "/web")]
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
pub fn AdminUser(user: UserState) -> impl IntoView {
    use crate::components::activate_modal::*;
    use crate::components::add_user::*;

    provide_meta_context();

    let is_active = user.is_active;
    let deactivate_action = create_server_action::<DeactivateUser>();
    let remove_user_action = create_server_action::<RemoveUser>();
    let last_version = create_rw_signal(0);
    let update_admin = use_context::<UpdateAdmin>().expect("user_state not set");

    create_effect(move |_| {
        if last_version() < deactivate_action.version()() {
            update_admin.0.update(|e| *e = !*e);
            last_version.set_untracked(deactivate_action.version()())
        }
    });

    let remove_action_count = create_rw_signal(0);
    create_effect(move |_| {
        if remove_action_count() < remove_user_action.version()() {
            update_admin.0.update(|e| *e = !*e);
            remove_action_count.set_untracked(remove_user_action.version()())
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

    let is_admin = user.is_admin;
    let is_p_admin = user.permissions.iter().any(|u| u.permission == 5);

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

    let stored_permission = store_value(user.permissions);
    let store_user = store_value(user.user_id.clone());

    view! {
        <ActivateModal user_id=store_user.get_value()/>
        <AddUserProject user_id=store_user.get_value()/>
        <tr>
            <td>{user.user_id.clone()}</td>
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
                                                _user_id: store_user.get_value(),
                                            })
                                    }
                                >
                                    <Suspense fallback=move || {
                                        view! {
                                            ,
                                            <div class="spinner-border"></div>
                                        }
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
                                <a
                                    href="#"
                                    class="btn btn-success btn-icon btn-sm ms-2"
                                    aria-label="Button"
                                    role="button"
                                    data-bs-toggle="modal"
                                    data-bs-target=format!("#ACU{}", store_user.get_value())
                                >
                                    <Suspense fallback=move || {
                                        view! { <div class="spinner-border"></div> }
                                    }>
                                        {move || {
                                            view! {
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    class="icon icon-tabler icon-tabler-users-plus"
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
                                                    <path d="M5 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path>
                                                    <path d="M3 21v-2a4 4 0 0 1 4 -4h4c.96 0 1.84 .338 2.53 .901"></path>
                                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                                    <path d="M16 19h6"></path>
                                                    <path d="M19 16v6"></path>
                                                </svg>
                                            }
                                        }}

                                    </Suspense>
                                </a>
                            }
                                .into_view()
                        } else {
                            view! {
                                // on:click=move |_| {set_deleting.set(token_id.get_value())}>
                                <a
                                    href="#"
                                    class="btn btn-success btn-icon btn-sm"
                                    aria-label="Button"
                                    role="button"
                                    data-bs-toggle="modal"
                                    data-bs-target=format!("#AV{}", store_user.get_value())
                                >
                                    <Suspense fallback=move || {
                                        view! { <div class="spinner-border"></div> }
                                    }>
                                        {move || {
                                            view! {
                                                ,
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
                                view! {
                                    <tr colspan="5">
                                        <td>"PID:"</td>
                                        <td>{item_clone.project_id.to_string()}</td>
                                        <td>"Role:"</td>
                                        <td>{item_clone.to_permission_string()}</td>
                                        <td>
                                            <div class="d-flex justify-content-end">
                                                <a
                                                    href="#"
                                                    class="btn btn btn-icon mx-2 btn-sm my-accordion-icon text-danger"
                                                    role="button"
                                                    aria-label="Button"
                                                    on:click=move |_| {
                                                        remove_user_action
                                                            .dispatch(RemoveUser {
                                                                _user_id: store_user.get_value(),
                                                                _project_id: item.project_id.to_string(),
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
