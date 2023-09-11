use aruna_rust_api::api::storage::models::v2::User;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

pub mod components;
pub mod error_template;
pub mod utils;

#[server(GetUserInfo, "/api", "GetJson")]
pub async fn get_user_info() -> Result<Option<User>, ServerFnError> {
    use axum_extra::extract::CookieJar;
    use http::header;
    use leptos_axum::ResponseOptions;
    use utils::aruna_api_handlers::who_am_i;

    let req_parts = use_context::<leptos_axum::RequestParts>()
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;
    let jar = CookieJar::from_headers(&req_parts.headers);

    match jar.get("logged_in") {
        Some(l) if l.value() == "false" => return Ok(None),
        None => return Ok(None),
        _ => {}
    }

    if let Some(cookie) = jar.get("token") {
        let user = who_am_i(cookie.value()).await.map_err(|_| {
            leptos::log!("Unable to query token from session");
            ServerFnError::Request("Invalid request, who_i_am".to_string())
        })?;
        return Ok(Some(user));
    } else {
        if let Some(response_options) = use_context::<ResponseOptions>() {
            response_options.insert_header(
                header::LOCATION,
                header::HeaderValue::from_str("/login").expect("Failed to create HeaderValue"),
            );
        }
    };

    Ok(None)
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

    let cordi = move || {
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
                                        "👋 Meet us @"
                                        <a href="https://www.nfdi.de/cordi-2023/?lang=en">
                                            "CORDI 2023"
                                        </a>
                                    </strong>
                                    ": We are proud to announce that we will be presenting our project at the Enabling RDM II session on September 13th, 2023"
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
                                    ng>Do you like cooki
                                </strong>
                                "🍪 We use cookies to ensure you get the best experience on our website."
                                <a href="./terms-of-service.html" target="_blank">Learn more</a>
                            </div>
                            <div class="col-auto">
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-bs-dismiss="offcanvas"
                                >
                                          Essential Cookie
                                </button>
                            </div>
                            <div class="col-auto">
                                <button
                                    type="button"
                                    class="btn btn-primary"
                                    data-bs-dismiss="offcanvas"
                                >
                                          Allow All C
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let res: Resource<bool, Option<User>> =
        create_local_resource(update_user.0, move |_| async move {
            //&get_user_info().await.ok().flatten()
            None
        });

    provide_context(res);
    provide_context(update_user);

    view! {
        <Stylesheet href="/tabler.min_v4.css"/>
        <Stylesheet id="leptos" href="/pkg/aruna_web_v4.css"/>
        <Script src="/tabler.min_v4.js"/>
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <div class="page">
            {cordi}
            // { cookies }
            <Router>
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
                            <Route path="" view=move || view! { <PersonalResources/> }/>
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
