use aruna_rust_api::api::storage::models::v2::User;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;
use utils::structs::WhoamiResponse;

pub mod components;
pub mod error_template;
pub mod utils;

pub enum GetUserResponse {
    User(User),
    NotRegistered,
    NotActivated,
    Error(String),
}

#[server(GetUserInfo, "/api", "GetJson")]
pub async fn get_user_info() -> Result<WhoamiResponse, ServerFnError> {
    use axum_extra::extract::CookieJar;
    use utils::aruna_api_handlers::who_am_i;

    let req_parts = use_context::<leptos_axum::RequestParts>()
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;
    let jar = CookieJar::from_headers(&req_parts.headers);

    match jar.get("logged_in") {
        Some(l) if l.value() == "false" => return Ok(WhoamiResponse::NotLoggedIn),
        None => return Ok(WhoamiResponse::NotLoggedIn),
        _ => {}
    }
    if let Some(cookie) = jar.get("token") {
        let token = cookie.value().to_string();
        return Ok(who_am_i(&token).await);
    } else {
        Ok(WhoamiResponse::NotLoggedIn)
    }
}

#[component]
pub fn EntryPoint() -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context();

    use crate::components::about::*;
    use crate::components::create_object::*;
    use crate::components::dash::*;
    use crate::components::dash_nav::*;
    use crate::components::footer::*;
    use crate::components::header::*;
    use crate::components::imprint::*;
    use crate::components::objects::*;
    use crate::components::personal_resources::*;
    use crate::components::register::*;
    use crate::components::search::*;
    use crate::components::tos::*;
    use crate::utils::structs::*;

    let update_user: UpdateUser = UpdateUser(create_rw_signal(true));

    let hide_cordi = create_rw_signal(true);

    create_effect(move |_| {
        let is_item = if let Ok(Some(storage)) = window().local_storage() {
            if let Ok(Some(_)) = storage.get_item("cordi") {
                true
            } else {
                false
            }
        } else {
            false
        };
        request_animation_frame(move || hide_cordi.set(is_item));
    });

    let _cordi = move || {
        view! {
                <div
                    class=move || if hide_cordi.get() { "offcanvas offcanvas-top"} else { "offcanvas offcanvas-top show"}
                    style="max-height: 90px;"
                    tabindex="-1"
                    id="cordi-canvas"
                    aria-modal="true"
                    role="dialog"
                >
                    <div class="offcanvas-body">
                        <div class="container">
                            <div class="row align-items-center">
                                <div class="col">
                                    <strong>
                                        "Update on version 2.0.0: "
                                    </strong>
                                    "We are sorry for the delay in the release of version 2.0.0. Testing and bug fixing took longer than expected and we need some time to prepare the final release. As we cannot just leave it at that, we are happy to announce that a test environment will be deployed soon, where everyone can participate and help us smooth things out!"
                                </div>
                                <div class="col-auto">
                                    <button
                                        type="button"
                                        class="btn btn-primary"
                                        data-bs-dismiss="offcanvas"
                                        on:click=move |_| {
                                            if let Ok(Some(storage)) = window().local_storage() {
                                                storage.set_item("cordi", "true").expect("Failed to set item");
                                                hide_cordi.set(true);
                                            }
                                        }
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        }
    };

    let _cookies = move || {
        view! {
            <div
                class="offcanvas offcanvas-bottom h-auto show"
                tabindex="-1"
                id="offcanvasBottom"
                aria-modal="true"
                role="dialog"
            >
                <div class="offcanvas-body">
                    <div class="container">
                        <div class="row align-items-center">
                            <div class="col">
                                <strong>
                                    Do you like cookies
                                </strong>
                                "🍪 We use cookies to ensure you get the best experience on our website."
                                <a href="./terms-of-service.html" target="_blank">Learn more</a>
                            </div>
                            <div class="col-auto">
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-bs-dismiss="offcanvas"
                                    on:click=move |_| {
                                            if let Ok(Some(storage)) = window().local_storage() {
                                                storage.set_item("allow-cookie", "true").expect("Failed to set item");
                                                hide_cordi.set(true);
                                            }
                                        }
                                >
                                          Essential Cookies
                                </button>
                            </div>
                            <div class="col-auto">
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-bs-dismiss="offcanvas"
                                    on:click=move |_| {
                                            if let Ok(Some(storage)) = window().local_storage() {
                                                storage.set_item("allow-cookie", "true").expect("Failed to set item");
                                                hide_cordi.set(true);
                                            }
                                        }
                                >
                                          Allow All Cookies
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let res: Resource<RwSignal<bool>, WhoamiResponse> = create_resource(
        move || update_user.0,
        move |_| async move {
            get_user_info()
                .await
                .unwrap_or_else(|e| WhoamiResponse::Error(e.to_string()))
        },
    );

    provide_context(res);
    provide_context(update_user);

    let red = move || match res.get() {
        Some(WhoamiResponse::NotActivated) => view! {
            <Redirect path="/activate"/>
        }
        .into_view(),
        Some(WhoamiResponse::NotRegistered) => view! {
            <Redirect path="/register"/>
        }
        .into_view(),
        _ => ().into_view(),
    };

    view! {
        <Stylesheet href="/tabler.min_v4.css"/>
        <Stylesheet id="leptos" href="/pkg/aruna_web_v4.css"/>
        <Script src="/tabler.min_v4.js"/>
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <div class="page">
            //{cordi}
            //{cookies}
            <Router>
                <Suspense>
                    { red }
                </Suspense>
                <Routes>
                    <Route
                        path="/"
                        view=move || {
                            view! {
                                <ArunaHeader/>
                                <Outlet/>
                                <Footer/>
                            }
                        }
                    >

                        <Route
                            path="register"
                            view=move || {
                                view! {
                                    <MainPage/>
                                    <RegisterPage/>
                                }
                            }
                        />

                        <Route
                            path="activate"
                            view=move || {
                                view! {
                                    <MainPage/>
                                    <ActivatePage/>
                                }
                            }
                        />

                        <Route path="about" view=move || view! { <About/> }/>
                        <Route path="imprint" view=move || view! { <Imprint/> }/>
                        <Route path="search" view=move || view! { <Search/> }/>
                        <Route path="tos" view=move || view! { <Tos/> }/>
                        <Dash/>
                        <Route
                            path="objects"
                            view=move || {
                                view! {
                                    <DashNav/>
                                    <Outlet/>
                                }
                            }
                        >

                            <Route path="create" view=move || view! { <CreateObjectPage/> }/>
                            <Route path=":id" view=move || view! { <ObjectOverview/> }/>
                            <Route path="" view=move || view! { <PersonalResources/>  }/>
                        </Route>
                        <Route
                            path=""
                            view=move || {
                                view! { <MainPage/> }
                            }
                        />

                    </Route>
                </Routes>
            </Router>
        </div>
    }
}

/// Renders the home page of your application.
#[component]
fn MainPage() -> impl IntoView {
    use crate::components::main_body::*;
    view! {
        <MainBody/>
        <Outlet/>
    }
}
