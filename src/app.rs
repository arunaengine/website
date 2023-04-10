use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UserState;

#[component]
pub fn EntryPoint(cx: Scope) -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context(cx);

    use crate::components::header::*;
    use crate::components::register::*;
    use crate::components::panel::*;


    let (read_user, set_user) = create_signal(cx, None::<UserState>);
    // share `set_user` with all children of this component
    provide_context(cx, set_user);
    provide_context(cx, read_user);

    view! {
        cx,
        // injects a stylesheet into the document <head>
        // id=leptos means cargo-leptos will hot-reload this stylesheet
        <Stylesheet href="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta17/dist/css/tabler.min.css" />
        <Stylesheet id="leptos" href="/pkg/leptos_start.css"/>
        <Script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta17/dist/js/tabler.min.js" />
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <Router>
            <main>
                <ArunaHeader/>
                <Routes>
                    <Route path="/" view=move |cx| view! { cx, <MainPage/> }>
                        <Route path="register" view=move |cx| view! { cx, <RegisterPage/> }/>
                        <Route path="activate" view=move |cx| view! { cx, <ActivatePage/> }/>
                        <Route path="" view=|_cx| ()/> // Fallback to make sure MainPage is rendered
                    </Route>
                    <Route path="/login" view=|cx| view! { cx,
                        <Login />
                    }/>
                    <ProtectedRoute path="/panel" redirect_path="/login" condition=|_cx| {true} view=move |cx| view! { cx,
                        <ArunaHeader/>
                        <Panel/> 
                    }/>
                </Routes>
            </main>
        </Router>
    }
}

/// Renders the home page of your application.
#[component]
fn MainPage(cx: Scope) -> impl IntoView {
    use crate::components::main_body::*;
    view! { cx,
        <MainBody />
        <Outlet/>
    }
}

/// Renders the home page of your application.
#[component]
fn Login(_cx: Scope) -> impl IntoView {
    let _ = window().location().set_href("http://localhost:3000/login");
}