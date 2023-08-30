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
    use crate::components::footer::*;
    use crate::components::header::*;
    use crate::components::imprint::*;
    use crate::components::panel::*;
    use crate::components::register::*;
    use crate::components::search::*;
    use crate::components::tos::*;
    use crate::utils::structs::*;

    let update_user: UpdateUser = UpdateUser(create_rw_signal(true));

    let res: Resource<bool, Option<UserState>> =
        create_resource(update_user.0, move |_| async move {
            // this is the ServerFn that is called by the GetUser Action above

            None::<UserState>

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
        <Router>
            <main>
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
                        <Panel/>
                        <Route
                            path=""
                            view=move || {
                                view! {
                                    <MainPage/>
                                }
                            }
                        />

                    </Route>
                </Routes>
            </main>
        </Router>
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
