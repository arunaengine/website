use leptos::*;
use leptos_meta::*;
use leptos_router::*;

/// Renders the home page of your application.
#[component]
pub fn ArunaHeader(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);
    // Creates a reactive value to update the button
    let (dark, toggle_dark) = create_signal(cx, "".to_string());
    let darkmode = move |_| {
        toggle_dark.update(|dark| {
            if *dark == "" {
                *dark = "theme-dark".to_string()
            } else {
                *dark = "".to_string()
            }
        });
    };

    let aruna_header = view! { cx,
        <h1 class="navbar-brand navbar-brand-light d-none-navbar-horizontal pe-0 pe-md-3">
            <a href=".">
                <img src="aruna_icon.png" width="32" height="32" alt="Aruna"
                    class="navbar-brand-image me-3" />
                "Aruna Object Storage"
            </a>
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

    let _notifications = view!(cx,
        <div class="nav-item dropdown d-none d-md-flex me-3">
            <a href="#" class="nav-link px-0 disabled" data-bs-toggle="dropdown" tabindex="-1"
                aria-label="Show notifications">
                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24"
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

    let _user = view!(cx,
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
                    <div>{ "ArunaUser" }</div>
                    <div class="mt-1 small text-muted">{ "Admin" }</div>
                </div>
            </a>
            <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
                <a href="#" class="dropdown-item">{ "Status" }</a>
                <a href="#" class="dropdown-item">{ "Profile" }</a>
                <a href="#" class="dropdown-item">{ "Feedback" }</a>
                <div class="dropdown-divider"></div>
                <a href="#" class="dropdown-item">{ "Settings" }</a>
                <a href="#" class="dropdown-item">{ "Logout" }</a>
            </div>
        </div>
    );

    view! {
        cx,

        <Body class=dark/>
        <div class="mb-3 sticky-top">
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
                                        <a class="nav-link" href="./#">
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
                                        </a>
                                    </li>
                                    <li class="nav-item">
                                        <a class="nav-link" href="./#">
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
                                        </a>
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
                            //{ notifications }
                            <A href="/login" class="btn btn-outline-success btn-sm px-4 me-sm-3 mt-2 mb-2">{"Login"}</A>
                        </div>
                    </div>
                </div>
            </header>
        </div>
    }
}
