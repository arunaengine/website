use leptos::*;
//use leptos_meta::*;
use leptos_router::*;

#[server(GetUserInfo, "/web")]
pub async fn get_user_info(#[allow(unused_variables)] cx: Scope) -> Result<crate::utils::structs::UserState, ServerFnError> {
    use crate::utils::aruna_api_handlers::who_am_i;
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx).unwrap();

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

/// Renders the home page of your application.
#[component(transparent)]
pub fn Panel(cx: Scope) -> impl IntoView {
  view! { cx,
    <Route path="/some-area" view=move |cx| {
      view! { cx, <div>
        <h2>"Some Area"</h2>
        <Outlet/>
      </div> }
    }>
      <Route path="/path-a/:id" view=move |cx| {
        view! { cx, <p>"Path A"</p> }
      }/>
      <Route path="/path-b/:id" view=move |cx| {
        view! { cx, <p>"Path B"</p> }
      }/>
    </Route>
  }
}
