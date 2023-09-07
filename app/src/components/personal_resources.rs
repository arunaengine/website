use crate::utils::{mocks::get_demo_data, structs::SearchResultEntry};
use aruna_rust_api::api::storage::models::v2::generic_resource::Resource;
use leptos::*;
//use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn SearchResult(res: Resource) -> impl IntoView {
    let entry = SearchResultEntry::from(res);
    let entry_clone = entry.clone();
    let name = move || entry_clone.name.to_string();
    let id = move || entry_clone.id.to_string();
    let absolute_link = || "/objects/".to_owned() + &id();
    view! {
        <div class="card m-1">
            {entry.get_card_status()}
            <div class="card-body d-flex container flex-column">
                {entry.get_ribbon()} <div class="row">
                    <div class="col-4">
                        <div>
                            <A class="text-primary" href=absolute_link()>
                                <h3>{name}</h3>
                            </A>
                            <A class="subheader" href=absolute_link()>
                                <h4>{id}</h4>
                            </A>
                        </div>
                        {entry.get_status()}
                        {entry.get_stats()}
                    </div>
                    <div class="col border-start me-4 container">
                        <div class="border-bottom pb-3 mb-2">{entry.get_key_values()}</div>
                        <div class="row">
                            <h4 class="subheader mb-0">"Description"</h4>
                            <p class="text-secondary mb-0">{entry.description}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }
}

#[component]
pub fn PersonalResources() -> impl IntoView {
    view! {
        <div class="container-xl text-start mt-4">
            <div class="row mt-2">
                    <div class="col ps-3">
                        <h2 class="text-primary">"Personal resources"</h2>
                        <div class="text-secondary">"All resource with personal permissions"</div>
                        <For
                            each=move || { get_demo_data().clone().into_iter() }
                            key=|res| {
                                match res {
                                    Resource::Collection(c) => c.id.clone(),
                                    Resource::Dataset(d) => d.id.clone(),
                                    Resource::Object(o) => o.id.clone(),
                                    Resource::Project(p) => p.id.clone(),
                                }
                            }
                            view=move |res| {
                                view! { <SearchResult res=res/> }
                            }
                        />
                </div>
            </div>
        </div>
    }
}
