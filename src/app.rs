#[cfg(feature = "hydrate")]
use crate::utils::modal::*;
use cfg_if::cfg_if;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn EntryPoint(cx: Scope) -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context(cx);

    cfg_if! { if #[cfg(feature = "hydrate")] {
        use wasm_bindgen::JsCast;
        let doc = document().unchecked_into::<web_sys::HtmlDocument>();
        log::debug!("{:#?}", doc.cookie());
    }};

    view! {
        cx,
        // injects a stylesheet into the document <head>
        // id=leptos means cargo-leptos will hot-reload this stylesheet
        <Script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta17/dist/js/tabler.min.js" />
        <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-kenU1KFdBIe4zVF0s0G1M5b4hcpxyD9F7jL+jjXkk+Q2h455rYXK/7HAuoJl+0I4" crossorigin="anonymous"></Script>
        <Stylesheet href="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta17/dist/css/tabler.min.css" />
        <Stylesheet id="leptos" href="/pkg/leptos_start.css"/>
        // sets the document title
        <Title text="Aruna Object Storage"/>

        // content for this welcome page
        <Router>
            <main>
                <Routes>
                    <Route path="" view=|cx| view! { cx, <MainPage/> }/>
                    <Route path="/login" view=|cx| view! { cx,
                        <Login />
                    }/>
                    <ProtectedRoute path="/panel" redirect_path="/login" condition=|_cx| {true} view=|cx| view! { cx, <MainPanel/> }/>
                    <ProtectedRoute path="/admin" redirect_path="/login" condition=|_cx| {false} view=|cx| view! { cx, <AdminPanel/> }/>
                </Routes>
            </main>
        </Router>
    }
}

/// Renders the home page of your application.
#[component]
fn MainPage(cx: Scope) -> impl IntoView {
    use crate::components::header::*;
    use crate::components::main_body::*;
    view! { cx,
        <ArunaHeader/>
        <MainBody />
    }
}

/// Renders the home page of your application.
#[component]
fn Login(_cx: Scope) -> impl IntoView {
    let _ = window().location().set_href("http://localhost:3000/login");
}

/// Renders the home page of your application.
#[component]
fn MainPanel(cx: Scope) -> impl IntoView {
    use crate::components::header::*;
    use crate::components::panel::*;
    view! { cx,
        <div class="page">
            <ArunaHeader/>
            <PanelBody/>
        </div>
    }
}

/// Renders the home page of your application.
#[component]
fn AdminPanel(cx: Scope) -> impl IntoView {
    use crate::components::header::*;
    view! { cx,
        <ArunaHeader/>
    }
}
