use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UpdateUser;

#[server(GetUserInfo, "/web")]
pub async fn get_user_info(#[allow(unused_variables)] cx: Scope) -> Result<crate::utils::structs::UserState, ServerFnError> {
    use crate::utils::aruna_api_handlers::who_am_i;
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx).ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;

    let sess = req.get_session();

    let user_info = sess
        .get::<crate::utils::structs::UserState>("user_info")
        .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?;

    let token = sess
        .get::<String>("token")
        .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
        .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;


    match user_info {
      Some(i) => Ok(i),
      None => {
          match who_am_i(&token).await {
            Ok(i) => Ok(i),
            Err(_) => return Err(ServerFnError::Request("Failed to get user_state".to_string())),
          }
      }
    }
}

#[component]
pub fn EntryPoint(cx: Scope) -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context(cx);

    use crate::components::header::*;
    use crate::components::register::*;
    use crate::components::panel::*;

    let update_user: UpdateUser = UpdateUser(create_rw_signal(cx, true));

    let res = create_resource(cx,
        update_user.0,
        move |_| async move {
            let user = get_user_info(cx).await.ok(); // this is the ServerFn that is called by the GetUser Action above
            log::debug!("updating user data: {user:#?}");

            user
        }
    );
    provide_context(cx, res);
    provide_context(cx, update_user);


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
                        //<ArunaHeader/>
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