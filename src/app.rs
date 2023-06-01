use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UpdateUser;

#[server(GetUserInfo, "/web")]
pub async fn get_user_info(
    #[allow(unused_variables)] cx: Scope,
) -> Result<crate::utils::structs::UserState, ServerFnError> {
    use crate::utils::aruna_api_handlers::{aruna_create_token, who_am_i};
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx)
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;

    let sess = req.get_session();

    let user_info = sess
        .get::<crate::utils::structs::UserState>("user_info")
        .map_err(|_| {
            log::debug!("Unable to query session with user_state");
            ServerFnError::Request("Invalid request".to_string())
        })?;

    let token = sess
        .get::<String>("token")
        .map_err(|_| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?
        .ok_or_else(|| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?;

    let session_id;

    match user_info {
        Some(mut i) => {
            let token_type = sess
                .get::<String>("token-type")
                .map_err(|_| {
                    log::debug!("Unable to query token from session 1");
                    ServerFnError::Request("Invalid request".to_string())
                })?
                .ok_or_else(|| {
                    log::debug!("Unable to query token from session 2");
                    ServerFnError::Request("Invalid request".to_string())
                })?;

            if token_type.as_str() != "aruna" {
                let create_resp =
                    aruna_create_token(crate::utils::aruna_api_helpers::new_session_req(), &token)
                        .await
                        .map_err(|_| {
                            log::debug!("Failed create_api_token");
                            ServerFnError::Request("Invalid request".to_string())
                        })?;

                sess.insert("token", create_resp.token_secret.to_string())
                    .map_err(|_| {
                        log::debug!("Unable to insert aruna token to session 1");
                        ServerFnError::Request("Invalid request".to_string())
                    })?;

                sess.insert("token-type", "aruna").map_err(|_| {
                    log::debug!("Unable to insert aruna token-type to session 2");
                    ServerFnError::Request("Invalid request".to_string())
                })?;

                session_id = create_resp.token.clone().unwrap_or_default().id;

                sess.insert("token-id", create_resp.token.unwrap_or_default().id)
                    .map_err(|_| {
                        log::debug!("Unable to insert aruna token-id to session 2");
                        ServerFnError::Request("Invalid request".to_string())
                    })?;
            } else {
                session_id = sess
                    .get::<String>("token-id")
                    .unwrap_or_default()
                    .unwrap_or_default();
            };

            if i.session_id.is_empty() {
                i.session_id = session_id;
                Ok(i)
            } else {
                Ok(i)
            }
        }
        None => {
            let token_type = sess
                .get::<String>("token-type")
                .map_err(|_| {
                    log::debug!("Unable to query token from session 1");
                    ServerFnError::Request("Invalid request".to_string())
                })?
                .ok_or_else(|| {
                    log::debug!("Unable to query token from session 2");
                    ServerFnError::Request("Invalid request".to_string())
                })?;

            if token_type.as_str() != "aruna" {
                let create_resp =
                    aruna_create_token(crate::utils::aruna_api_helpers::new_session_req(), &token)
                        .await
                        .map_err(|_| {
                            log::debug!("Failed create_api_token");
                            ServerFnError::Request("Invalid request".to_string())
                        })?;

                sess.insert("token", create_resp.token_secret.to_string())
                    .map_err(|_| {
                        log::debug!("Unable to insert aruna token to session 1");
                        ServerFnError::Request("Invalid request".to_string())
                    })?;

                sess.insert("token-type", "aruna").map_err(|_| {
                    log::debug!("Unable to insert aruna token-type to session 2");
                    ServerFnError::Request("Invalid request".to_string())
                })?;

                session_id = create_resp.token.clone().unwrap_or_default().id;

                sess.insert("token-id", create_resp.token.unwrap_or_default().id)
                    .map_err(|_| {
                        log::debug!("Unable to insert aruna token-id to session 2");
                        ServerFnError::Request("Invalid request".to_string())
                    })?;
            } else {
                session_id = sess
                    .get::<String>("token-id")
                    .unwrap_or_default()
                    .unwrap_or_default();
            };

            match who_am_i(&token).await {
                Ok(mut i) => {
                    i.session_id = session_id;
                    Ok(i)
                }
                Err(_) => {
                    log::debug!("Who am i request error");
                    return Err(ServerFnError::Request(
                        "Failed to get user_state".to_string(),
                    ));
                }
            }
        }
    }
}

#[component]
pub fn EntryPoint(cx: Scope) -> impl IntoView {
    // Provides context that manages stylesheets, titles, meta tags, etc.
    provide_meta_context(cx);

    use crate::components::about::*;
    use crate::components::footer::*;
    use crate::components::header::*;
    use crate::components::imprint::*;
    use crate::components::panel::*;
    use crate::components::register::*;
    use crate::components::tos::*;

    let update_user: UpdateUser = UpdateUser(create_rw_signal(cx, true));

    let res = create_resource(cx, update_user.0, move |_| async move {
        // this is the ServerFn that is called by the GetUser Action above
        get_user_info(cx).await.ok()
    });

    provide_context(cx, res);
    provide_context(cx, update_user);

    view! {
        cx,
        // injects a stylesheet into the document <head>
        // id=leptos means cargo-leptos will hot-reload this stylesheet
        <Stylesheet href="/tabler.min.css" />
        <Stylesheet id="leptos" href="/pkg/aruna_web.css"/>
        <Script src="/tabler.min.js" />
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <Router>
            <main>
                <Routes>
                    <Route path="/" view=move |cx| view! { cx,
                        <ArunaHeader/>
                        <Outlet/>
                        <Footer/>
                    }>
                        <Route path="register" view=move |cx| view! { cx, <MainPage/><RegisterPage/> }/>
                        <Route path="activate" view=move |cx| view! { cx, <MainPage/><ActivatePage/> }/>
                        <Route path="about" view=move |cx| view! { cx, <About/>}/>
                        <Route path="imprint" view=move |cx| view! { cx, <Imprint/>}/>
                        <Route path="tos" view=move |cx| view! { cx, <Tos/>}/>
                        <Panel/>
                        <Route path="" view=move |cx| view!{cx, <MainPage/>}/>
                    </Route>
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
