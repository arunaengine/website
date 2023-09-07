use leptos::*;
use leptos_meta::*;
use leptos_router::*;

pub mod components;
pub mod error_template;
pub mod utils;

#[component]
pub fn EntryPoint() -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context();

    use crate::components::about::*;
    use crate::components::create_object::*;
    use crate::components::dash::*;
    use crate::components::footer::*;
    use crate::components::header::*;
    use crate::components::imprint::*;
    use crate::components::objects::*;
    use crate::components::register::*;
    use crate::components::search::*;
    use crate::components::tos::*;
    use crate::utils::structs::*;

    let update_user: UpdateUser = UpdateUser(create_rw_signal(true));

    let cordi = move || {
        view! {
            <div class="offcanvas offcanvas-top show" style="max-height: 90px;" tabindex="-1" id="offcanvasBottom" aria-modal="true" role="dialog">
              <div class="offcanvas-body">
                <div class="container">
                  <div class="row align-items-center">
                    <div class="col">
                      <strong>"👋 Meet us @"<a href="https://www.nfdi.de/cordi-2023/?lang=en">"CORDI 2023"</a></strong>": We are proud to announce that we will be presenting our project at the Enabling RDM II session on September 13th, 2023"
                    </div>
                    <div class="col-auto">
                      <button type="button" class="btn btn-primary" data-bs-dismiss="offcanvas">
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
            <div class="offcanvas offcanvas-bottom h-auto show" tabindex="-1" id="offcanvasBottom" aria-modal="true" role="dialog">
              <div class="offcanvas-body">
                <div class="container">
                  <div class="row align-items-center">
                    <div class="col">
                      <strong>Do you like cookies?</strong>"🍪 We use cookies to ensure you get the best experience on our website." <a href="./terms-of-service.html" target="_blank">Learn more</a>
                    </div>
                    <div class="col-auto">
                      <button type="button" class="btn btn-primary" data-bs-dismiss="offcanvas">
                        Essential Cookies Only
                      </button>
                    </div>
                    <div class="col-auto">
                      <button type="button" class="btn btn-primary" data-bs-dismiss="offcanvas">
                        Allow All Cookies
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
        }
    };

    let res: Resource<bool, Option<UserState>> =
        create_local_resource(update_user.0, move |_| async move {
            // this is the ServerFn that is called by the GetUser Action above

            Some(UserState {
                user_id: "A_iD".to_string(),
                display_name: "Gott".to_string(),
                email: "A".to_string(),
                is_active: true,
                is_admin: true,
                permissions: vec![],
                session_id: "A".to_string(),
            })
            //None::<UserState>

            //get_user_info().await.ok()
        });

    provide_context(res);
    provide_context(update_user);

    view! {
        <Stylesheet href="/tabler.min.css"/>
        <Stylesheet id="leptos" href="/pkg/aruna_web_workspace.css"/>
        <Script src="/tabler.min.js"/>
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <div class="page">
            { cordi }
            //{ cookies }
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
                        <Route path="objects/create" view=move || view! { <CreateObjectPage/> }/>
                        <Route path="objects/:id" view=move || view! { <ObjectOverview/> }/>
                        <Dash/>
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
