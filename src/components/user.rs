use leptos::*;
use leptos_meta::*;
use crate::utils::structs::UserState;

/// Renders the home page of your application.
#[component]
pub fn AdminUser(cx: Scope, user: UserState) -> impl IntoView {
    provide_meta_context(cx);

    let is_active = user.is_active.clone(); 


    let create_active_badges = {move || {
        if is_active {
            view!{cx, 
                <span class="status status-green">
                    <span class="status-dot"></span>
                    "active"
                </span>
            }
        }else{
            view!{cx, 
                <span class="status status-yellow">
                    <span class="status-dot"></span>
                    "inactive"
                </span>
            }
        }
    }};

    let is_admin = user.is_admin.clone();
    let is_p_admin = user.permissions.clone().iter().any(|u| u.permission == 5);

    let create_role_badges = {move || {
        if is_admin {
            view!{cx, 
                <span class="status status-red">
                    <span class="status-dot"></span>
                    "admin"
                </span>
            }
        }else{
            if is_p_admin {
                view!{cx, 
                    <span class="status status-purple">
                        <span class="status-dot"></span>
                        "p-admin"
                    </span>
                }
            }else{
                view!{cx, 
                    <span class="status status-blue">
                        <span class="status-dot"></span>
                        "user"
                    </span>
                }
            }
        }
    }};

    let stored_permission = store_value(cx, user.permissions);
    

    view! {cx,
        <tr>
            <td>{user.user_id.clone()}</td>
            <td>{user.display_name.clone()}</td>
            <td>{user.email.clone()}</td>
            <td>{create_active_badges}{create_role_badges}</td>
            <td>
                <div class="d-flex justify-content-end">
                    <a href="#" class="btn btn btn-icon mx-2 btn-sm my-accordion-icon" role="button" aria-label="Button" data-bs-toggle="collapse" data-bs-target=format!(r##"#U{}"##, user.user_id.clone()) aria-expanded="false">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-down" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 5l0 14"></path>
                            <path d="M18 13l-6 6"></path>
                            <path d="M6 13l6 6"></path>
                        </svg>
                    </a>
                    {move || 
                        if is_active {
                            view!{cx,
                                <a href="#" class="btn btn-danger btn-icon btn-sm" aria-label="Button" role="button" >//on:click=move |_| {set_deleting.set(token_id.get_value())}>
                                <Suspense fallback=move || view! { cx, <div class="spinner-border"></div> }>
                                    {move || {
                                        view!{cx, 
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-minus" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M5 12l14 0"></path>
                                            </svg>
                                        }
                                    }}
                                    </Suspense>
                                </a>
                                }
                            }else{
                                view!{cx,
                                <a href="#" class="btn btn-success btn-icon btn-sm" aria-label="Button" role="button" >//on:click=move |_| {set_deleting.set(token_id.get_value())}>
                                <Suspense fallback=move || view! { cx, <div class="spinner-border"></div> }>
                                    {move || {
                                        view!{cx, 
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M12 5l0 14"></path>
                                                <path d="M5 12l14 0"></path>
                                            </svg>
                                        }
                                    }}
                                    </Suspense>
                                </a>
                                }
                            }
                    }
                </div>
            </td>
        </tr>
        <tr class="accordion-collapse collapse" id=format!("U{}", user.user_id.clone()) data-bs-parent="#adminTable">
            <Transition fallback=move || view! { cx, <tr><td colspan="5" class="text-center"><div class="spinner-border"></div></td></tr> }>
            {
                move || if !stored_permission.get_value().is_empty() {
                    stored_permission.get_value().into_iter()
                    .map(|item| view! {
                        cx,
                        <td>"PID:"</td>
                        <td>{item.project_id.to_string()}</td>
                        <td>"Role:"</td>
                        <td>{item.to_permission_string()}</td>
                        <div class="d-flex justify-content-end">
                            <a href="#" class="btn btn btn-icon mx-2 btn-sm my-accordion-icon" role="button" aria-label="Button">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-down" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M12 5l0 14"></path>
                                    <path d="M18 13l-6 6"></path>
                                    <path d="M6 13l6 6"></path>
                                </svg>
                            </a>
                        </div>
                    })
                    .collect::<Vec<_>>().into_view(cx) 
                }else{
                    view!{cx, <tr><td colspan="4" class="text-center">"Looks like this user is currently not member in any project!"</td></tr>}.into_view(cx)
                }
            }
            </Transition>
        </tr>
    }
}