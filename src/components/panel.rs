use leptos::*;
//use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UpdateUser;

/// Renders the home page of your application.
#[component(transparent)]
pub fn Panel(cx: Scope) -> impl IntoView {
    use crate::components::panel_nav::*;
    use crate::components::projects::*;
    use crate::components::tokens::*;

    let update_user = use_context::<UpdateUser>(cx).expect("user_state not set");

    update_user.0.update(|e| *e = !*e);

    view! { cx,
      <Route path="panel" view=move |cx| {view! { cx, <PanelNav /><Outlet/>}}>
        <Route path="projects" view=move |cx| view! { cx, <ProjectsOverview /> }/>
        <Route path="collection" view=move |cx| "Collections".into_view(cx)/>
        <Route path="admin" view=move |cx| "Admin".into_view(cx)/>
        <Route path="tokens" view=move |cx| view! { cx, <TokensOverview/> }/>
        <Route path="" view=move |cx| ().into_view(cx)/>
      </Route>
    }
}
