use leptos::*;
//use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::UpdateUser;

/// Renders the home page of your application.
#[component(transparent)]
pub fn Panel() -> impl IntoView {
    use crate::components::admin::*;
    use crate::components::panel_content::*;
    use crate::components::panel_nav::*;
    use crate::components::projects::*;
    use crate::components::tokens::*;

    let update_user = use_context::<UpdateUser>().expect("user_state not set");

    update_user.0.update(|e| *e = !*e);

    view! {
        ,
        <Route
            path="panel"
            view=move || {
                view! {
                    <PanelNav/>
                    <Outlet/>
                }
            }
        >
            <Route path="projects" view=move || view! { <ProjectsOverview/> }/>
            <Route path="collection" view=move || "Collections".into_view()/>
            <Route path="admin" view=move || view! { <AdminOverview/> }/>
            <Route path="tokens" view=move || view! { <TokensOverview/> }/>
            <Route path="" view=move || view! { <PanelContent/> }/>
        </Route>
    }
}
