use leptos::*;
use leptos_meta::*;
use leptos_router::*;
use cfg_if::cfg_if;

use crate::utils::structs::{UpdateUser, UserState};

/// Renders the home page of your application.
#[component]
pub fn ArunaHeader(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    let get_user =
        use_context::<Resource<bool, Option<UserState>>>(cx).expect("user_state not set");

    // On first load -> Check if user is logged in
    let _update_user = use_context::<UpdateUser>(cx).expect("user_state not set");

    let is_logged_memo = create_memo(cx, move |_| get_user.read(cx).flatten().is_some());
    // Creates a reactive value to update the button
    let (dark, toggle_dark) = create_signal(cx, "".to_string());
    let darkmode = move |_| {
        toggle_dark.update(|dark| {
            if dark.is_empty() {
                *dark = "theme-dark".to_string()
            } else {
                *dark = "".to_string()
            }
        });
    };

    let hide_cookies = create_rw_signal(cx, false);

    cfg_if! {
        if #[cfg(feature = "hydrate")] {
            if let Ok(Some(storage)) = window().local_storage() {
                if let Ok(Some(_)) = storage.get_item("allow-cookie"){
                    hide_cookies.set(true);
                }
            }
        }
    };        
    let aruna_header = view! { cx,
        <h1 class="navbar-brand navbar-brand-light d-none-navbar-horizontal pe-0 pe-md-3">
            <A href="/">
                <img src="/aruna_icon.png" width="32" height="32" alt="Aruna"
                    class="navbar-brand-image me-3" />
                "Aruna Object Storage"
            </A>
        </h1>
    };

    let github = view!(cx,
        <div class="nav-item d-none d-md-flex me-3">
            <div class="btn-list theme-dark">
                <a href="https://github.com/ArunaStorage/ArunaServer" class="btn" target="_blank" rel="noreferrer">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24"
                        viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                        stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path
                            d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
                    </svg>
                    { "Source code" }
                </a>
            </div>
        </div>
    );

    let dark_light = view!(cx,


        <a href="#" class="nav-link px-0 hide-theme-dark" title="Enable dark mode"
            data-bs-toggle="tooltip" data-bs-placement="bottom" on:click=darkmode>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24"
                viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path
                    d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
            </svg>
        </a>
        <a href="#" class="nav-link px-0 hide-theme-light" title="Enable light mode"
            data-bs-toggle="tooltip" data-bs-placement="bottom" on:click=darkmode>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24"
                viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
                <path
                    d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
            </svg>
        </a>
    );

    let notifications = view!(cx,
        <div class="nav-item dropdown d-none d-md-flex me-3">
            <a href="#" class="nav-link px-0 disabled" data-bs-toggle="dropdown" tabindex="-1"
                aria-label="Coming soon">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon text-gray" width="24" height="24"
                    viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"
                    stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <path
                        d="M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
                    <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
                </svg>
                //<span class="badge bg-red"></span>
            </a>
        </div>

    );


    let class_cookie = move || {
        format!(
        "cookie-consent {}",
          if hide_cookies() {
            "hidden"
          } else {
            ""
          }
        )
      };

    let user_elem = view! { cx,
    <Suspense fallback=move || view! {cx, <div class="spinner-border"></div>}>
        { move || {
            match get_user.read(cx).flatten() {
                Some(u) => {
                    view!{cx,
                        <div class="nav-item dropdown">
                            <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown"
                                aria-label="Open user menu">
                                <span>
                                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user-circle" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                        <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"></path>
                                        <path d="M12 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"></path>
                                        <path d="M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855"></path>
                                    </svg>
                                </span>
                                <div class="d-none d-xl-block ps-2">
                                    <div>{ u.display_name }</div>
                                    { move || {
                                            if u.is_admin {
                                                view!{cx, <div class="mt-1 small text-muted">{ "Admin" }</div>}
                                            }else{
                                                view!{cx, <div class="mt-1 small text-muted">{ "User" }</div>}
                                            }
                                        }
                                    }
                                </div>
                            </a>
                            <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                                <a href="/logout" on:click=move |_| {let _ = window().location().set_href("/logout");} class="dropdown-item">{ "Logout" }</a>
                            </div>
                        </div>
                    }.into_view(cx)

                }
                None => {
                        view!{cx, <a href="/login" on:click=move |_| {

                            if let Ok(Some(storage)) = window().local_storage() {
                                if let Ok(Some(cookie_value)) = storage.get_item("allow-cookie"){
                                    if cookie_value == "false" {
                                        storage.clear().unwrap_or_default();
                                        let _ = window().location().set_href("/");
                                    }else{
                                        let _ = window().location().set_href("/login");
                                    }
                                }else{
                                    storage.clear().unwrap_or_default();
                                    let _ = window().location().set_href("/");
                                }
                            }
                        } class="btn btn-outline-success btn-sm px-4 me-sm-3 mt-2 mb-2">{"Login"}</a>}.into_view(cx)
                    }
                }
            }
        }
        </Suspense>

    };

    view! {
        cx,
        <Body class=dark/>
        <div class="sticky-top">
            <header class="navbar navbar-expand-md navbar-dark d-print-none sticky-top">
                <div class="container-xl">
                    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbar-menu"
                        aria-controls="navbar-menu" aria-expanded="false" aria-label="Toggle navigation">
                        <span class="navbar-toggler-icon"></span>
                    </button>
                    { aruna_header }
                    <div class="navbar-nav flex-row order-md-last">
                        <div class="collapse navbar-collapse" id="navbar-menu">
                            <div class="container-xl d-block">
                                <ul class="navbar-nav">
                                    <li class="nav-item active">
                                        <A class="nav-link" href="/">
                                            <span
                                                class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-home" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                    <path d="M5 12l-2 0l9 -9l9 9l-2 0"></path>
                                                    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"></path>
                                                    <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"></path>
                                                </svg>
                                            </span>
                                            <span class="nav-link-title">
                                                { "Home" }
                                            </span>
                                        </A>
                                    </li>
                                    {move ||
                                        if is_logged_memo() {
                                            view!{cx,
                                                <li class="nav-item">
                                                    <A class="nav-link" href="/panel">
                                                        <span
                                                            class="nav-link-icon d-md-none d-lg-inline-block">
                                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-dashboard" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                                <path d="M12 13m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
                                                                <path d="M13.45 11.55l2.05 -2.05"></path>
                                                                <path d="M6.4 20a9 9 0 1 1 11.2 0z"></path>
                                                            </svg>
                                                        </span>
                                                        <span class="nav-link-title">
                                                            { "Dashboard" }
                                                        </span>
                                                    </A>
                                                </li>
                                            }.into_view(cx)
                                        }else{
                                            ().into_view(cx)
                                        }
                                    }
                                    <li class="nav-item">
                                        <A class="nav-link" href="/about">
                                            <span
                                                class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-square-rounded" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                    <path d="M12 9h.01"></path>
                                                    <path d="M11 12h1v4h1"></path>
                                                    <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z"></path>
                                                </svg>
                                            </span>
                                            <span class="nav-link-title">
                                                { "About" }
                                            </span>
                                        </A>
                                    </li>
                                    <li class="nav-item dropdown">
                                        <a class="nav-link dropdown-toggle" href="#navbar-third" data-bs-toggle="dropdown"
                                            data-bs-auto-close="outside" role="button" aria-expanded="false">
                                            <span
                                                class="nav-link-icon d-md-none d-lg-inline-block">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-book" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                    <path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"></path>
                                                    <path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"></path>
                                                    <path d="M3 6l0 13"></path>
                                                    <path d="M12 6l0 13"></path>
                                                    <path d="M21 6l0 13"></path>
                                                </svg>
                                            </span>
                                            <span class="nav-link-title">
                                                { "Docs" }
                                            </span>
                                        </a>
                                        <div class="dropdown-menu">
                                            <a class="dropdown-item" href="./#">
                                                { "Rust" }
                                            </a>
                                            <a class="dropdown-item" href="./#">
                                                { "Python" }
                                            </a>
                                            <a class="dropdown-item" href="./#">
                                                { "cURL" }
                                            </a>
                                            <a class="dropdown-item" href="./#">
                                                { "Go" }
                                            </a>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        { github }
                        <div class="d-none d-md-flex">
                            { dark_light }
                            { notifications }
                            { user_elem }
                        </div>
                    </div>
                </div>
            </header>
        </div>

        {move || view!{cx, 
            <div class=class_cookie>
                <span>"This site uses cookies to store user sessions, without these login for internal dashboard will be unavailable. see "<a href="/privacy" class="ms-2 text-decoration-none">" privacy policy"</a> "for more information"</span>
                <div class="mt-2 d-flex align-items-center justify-content-center g-2">
                <button class="allow-button me-1" on:click=move |_| {
                    if let Ok(Some(storage)) = window().local_storage() {
                        _ = storage.set("allow-cookie", "true");
                        hide_cookies.set(true);
                    }
                }>"Allow cookies"</button>
                <button class="allow-button ms-1" on:click=move |_| {
                    if let Ok(Some(storage)) = window().local_storage() {
                        _ = storage.set("allow-cookie", "false");
                        hide_cookies.set(true);
                    }
                }>"Disallow"</button>
                </div>
            </div>
            }.into_view(cx)
        }
    }
}
