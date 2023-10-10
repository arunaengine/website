use aruna_rust_api::api::storage::models::v2::User;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

/// Renders the home page of your application.
#[component]
pub fn DashNav() -> impl IntoView {
    provide_meta_context();

    let loc = use_location();

    let path = loc.pathname;

    let get_user =
        use_context::<Resource<bool, Option<(User, String)>>>().expect("user_state not set");
    let (user, _) = get_user.get().flatten().unwrap_or_default();

    let is_admin = create_memo(move |_| user.attributes.clone().unwrap_or_default().global_admin);

    view! {
        <Show when=move || get_user().map(|e| e.is_some()).unwrap_or_default() fallback=|| ()>
            <header class="navbar-expand-md">
                <div class="collapse navbar-collapse" id="navbar-menu">
                    <div class="navbar navbar-light">
                        <div class="container-xl">
                            <ul class="navbar-nav">
                                <li
                                    class="nav-item"
                                    class:active=move || { path().contains("news") }
                                >
                                    <A class="nav-link" href="/dash/news">
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon icon-tabler icon-tabler-news"
                                                width="40"
                                                height="40"
                                                viewBox="0 0 24 24"
                                                stroke-width="2"
                                                stroke="currentColor"
                                                fill="none"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M16 6h3a1 1 0 0 1 1 1v11a2 2 0 0 1 -4 0v-13a1 1 0 0 0 -1 -1h-10a1 1 0 0 0 -1 1v12a3 3 0 0 0 3 3h11"></path>
                                                <path d="M8 8l4 0"></path>
                                                <path d="M8 12l4 0"></path>
                                                <path d="M8 16l4 0"></path>
                                            </svg>
                                        </span>
                                        <span class="nav-link-title">"News"</span>
                                    </A>
                                </li>
                                <li
                                    class="nav-item"
                                    class:active=move || { path().contains("search") }
                                >
                                    <A class="nav-link" href="/dash/search">
                                        <span class="nav-link-icon d-md-none d-lg-inline-block">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon icon-tabler icon-tabler-search"
                                                width="40"
                                                height="40"
                                                viewBox="0 0 24 24"
                                                stroke-width="2"
                                                stroke="currentColor"
                                                fill="none"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"></path>
                                                <path d="M21 21l-6 -6"></path>
                                            </svg>
                                        </span>
                                        <span class="nav-link-title">"Search"</span>
                                    </A>
                                </li>
                                <li
                                    class="nav-item"
                                    class:active=move || { path().contains("objects") }
                                >
                                    <A class="nav-link" href="/objects">
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
                                        <span class="nav-link-title">"Resources"</span>
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
                                        <A class="dropdown-item" href="/dash/tokens">
                                            "Tokens"
                                        </A>
                                        <A
                                            class="dropdown-item disabled"
                                            href="/dash/service_accounts"
                                        >
                                            "Service accounts"
                                        </A>
                                    </div>
                                </li>
                                <Suspense fallback=move || ().into_view()>
                                    <li
                                        class="nav-item"
                                        class:active=move || { path().contains("admin") }
                                    >
                                        <a
                                            class="nav-link"
                                            class:disabled=move || { !is_admin() }
                                            href="/dash/admin"
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
                                </Suspense>
                            </ul>
                        </div>
                    </div>
                </div>
            </header>
        </Show>
    }
}
