use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UserState;

/// Renders the home page of your application.
#[component]
pub fn PanelNav() -> impl IntoView {
    provide_meta_context();

    let loc = use_location();

    let path = loc.pathname;

    let get_user = use_context::<Resource<bool, Option<UserState>>>().expect("user_state not set");

    let is_admin = create_memo(move |_| {
        get_user
            .get()
            .unwrap_or_default()
            .unwrap_or_default()
            .is_admin
    });

    view! {
        <header class="navbar-expand-md">
            <div class="collapse navbar-collapse" id="navbar-menu">
                <div class="navbar navbar-light">
                    <div class="container-xl">
                        <ul class="navbar-nav">
                            <li
                                class="nav-item"
                                class:active=move || { path().contains("projects") }
                            >
                                <A class="nav-link" href="projects">
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="icon icon-tabler icon-tabler-notebook"
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
                                            <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"></path>
                                            <path d="M13 8l2 0"></path>
                                            <path d="M13 12l2 0"></path>
                                        </svg>
                                    </span>
                                    <span class="nav-link-title">"Projects"</span>
                                </A>
                            </li>
                            <li
                                class="nav-item"
                                class:active=move || { path().contains("collection") }
                            >
                                <A class="nav-link disabled" href="collection">
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="icon icon-tabler icon-tabler-bucket"
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
                                            <path d="M12 7m-8 0a8 4 0 1 0 16 0a8 4 0 1 0 -16 0"></path>
                                            <path d="M4 7c0 .664 .088 1.324 .263 1.965l2.737 10.035c.5 1.5 2.239 2 5 2s4.5 -.5 5 -2c.333 -1 1.246 -4.345 2.737 -10.035a7.45 7.45 0 0 0 .263 -1.965"></path>
                                        </svg>
                                    </span>
                                    <span class="nav-link-title">"Collections"</span>
                                </A>
                            </li>
                            <li
                                class="nav-item dropdown"
                                id="access-dropdown"
                                class:active=move || { path().contains("tokens") }
                            >
                                <a
                                    class="nav-link dropdown-toggle"
                                    href="#navbar-third"
                                    data-bs-toggle="dropdown"
                                    data-bs-target="#access-dropdown"
                                    data-bs-auto-close="true"
                                    role="button"
                                    aria-expanded="false"
                                >
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="icon icon-tabler icon-tabler-key"
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
                                            <path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z"></path>
                                            <path d="M15 9h.01"></path>
                                        </svg>
                                    </span>
                                    <span class="nav-link-title">"Access"</span>
                                </a>
                                <div class="dropdown-menu">
                                    <A class="dropdown-item" href="tokens">
                                        "Tokens"
                                    </A>
                                    <a class="dropdown-item disabled" href="./#">
                                        "Service accounts"
                                    </a>
                                </div>
                            </li>
                            <li class="nav-item" class:active=move || { path().contains("admin") }>
                                <a
                                    class="nav-link"
                                    class:disabled=move || { !is_admin() }
                                    href="/panel/admin"
                                >
                                    <span class="nav-link-icon d-md-none d-lg-inline-block">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="icon icon-tabler icon-tabler-user-cog"
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
                                            <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path>
                                            <path d="M6 21v-2a4 4 0 0 1 4 -4h2.5"></path>
                                            <path d="M19.001 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
                                            <path d="M19.001 15.5v1.5"></path>
                                            <path d="M19.001 21v1.5"></path>
                                            <path d="M22.032 17.25l-1.299 .75"></path>
                                            <path d="M17.27 20l-1.3 .75"></path>
                                            <path d="M15.97 17.25l1.3 .75"></path>
                                            <path d="M20.733 20l1.3 .75"></path>
                                        </svg>
                                    </span>
                                    <span class="nav-link-title">"Admin"</span>
                                </a>
                            </li>
                        </ul>
                        <div class="my-2 my-md-0 flex-grow-1 flex-md-grow-0 order-first order-md-last">
                            <select
                                hidden
                                type="text"
                                class="form-select ts-hidden-accessible"
                                id="select-project"
                                value=""
                                tabindex="-1"
                            >
                                <option value="project_1">"Project_1"</option>
                                <option value="jQuery">"jQuery"</option>
                                <option value="Bootstrap">"Bootstrap"</option>
                                <option value="Ruby">"Ruby"</option>
                                <option value="Python">"Python"</option>
                                <option value="HTML">"HTML"</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    }
}
