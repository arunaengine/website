use leptos::*;
use leptos_router::*;

#[component(transparent)]
pub fn Dash() -> impl IntoView {
    use crate::components::admin::*;
    use crate::components::dash_landing_content::*;
    use crate::components::dash_nav::*;
    use crate::components::data_proxies::*;
    use crate::components::search::*;
    use crate::components::tokens::*;

    view! {
        <Route
            path="dash"
            view=move || {
                view! {
                    <DashNav/>
                    <Outlet/>
                }
            }
        >

            <Route path="news" view=move || view! { <DashLanding/> }/>
            <Route path="search" view=move || view! { <Search/> }/>
            <Route path="resources" view=move || "Resources".into_view()/>
            <Route path="admin" view=move || view! { <AdminOverview/> }/>
            <Route path="tokens" view=move || view! { <TokensOverview/> }/>
            <Route path="proxies" view=move || view! { <DataProxyOverview/> }/>
            <Route path="" view=move || view! { <Redirect path="news"/> }/>
        </Route>
    }
}
