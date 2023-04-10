use leptos::*;
//use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UpdateUser;

/// Renders the home page of your application.
#[component(transparent)]
pub fn Panel(cx: Scope) -> impl IntoView {

  let update_user = use_context::<UpdateUser>(cx)
        .expect("user_state not set");


  view! { cx,
    { move || update_user.0.update(|e| *e = !*e)}
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
