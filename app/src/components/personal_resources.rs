use crate::utils::structs::{GetOwnedResources, SearchResultEntry};
use aruna_rust_api::api::storage::models::v2::{generic_resource::Resource, User};
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
        <div class="card mb-2">
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
                        <span class="status status-orange">
                            WRITE
                        </span>
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
    // This takes the user context and creates a server call for
    // all resources that are explicitly statet in User{permissions} field
    let ctx = match use_context::<leptos::Resource<bool, Option<(User, String)>>>() {
        Some(res) => res.get().flatten(),
        None => None,
    };
    // This has to be manually parsed, because User structs can have
    // empty vectors as fields, and serde does not deserialize them
    // correctly if nested, so these needed fields need to be parsed
    // by hand and then annotated with #[server(default)] and #[derive(Default)]
    let query_params = match ctx {
        Some((user, token)) => {
            let perms = match user.attributes {
                Some(a) => a.personal_permissions,
                None => vec![],
            };
            Some(GetOwnedResources { perms, token })

            //Some(resource)
        }
        None => None,
    };
    // Renders a view for each resource or returns a default page if no resources are found
    let element = move || {
        if let Some(query) = query_params.clone() {
            // Runs async server call
            let resource = create_local_resource(move || query.clone(), get_user_resources);
            // Puts everything into a nice view
            view! {
                <Suspense fallback=move || view!{ <p>"Loading resources ..." </p>}>
                    {move || {
                        resource.get().map(|resources| match resources {
                            Ok(res) => view!{
                                 <For
                                 each=move || res.clone()
                                 key=|result| {
                                     match result {
                                         Resource::Collection(c) => c.id.clone(),
                                         Resource::Dataset(d) => d.id.clone(),
                                         Resource::Object(o) => o.id.clone(),
                                         Resource::Project(p) => p.id.clone(),
                                     }
                                 }

                                 children=move |res| {
                                     view! { <SearchResult res=res/> }
                                }
                                />
                            }.into_view(),
                            Err(e)=> {
                                leptos::logging::log!("{e:?}");
                                view!{<p> "Error while loading resources" </p>}.into_view()
                            }
                        })
                    }
                }
                </Suspense>
            }
            .into_view()
        } else {
            view! {
                <p> "Nothing to see here!" </p>
            }
            .into_view()
        }
    };

    view! {
        <div class="container-xl text-start mt-3">
            <div class="row mb-4">
                <div class="col">
                    <div class="page-pretitle text-start">
                        Personal Permissions
                    </div>
                    <h2 class="page-title">
                        Resource
                    </h2>
                </div>
                <div class="col-auto ms-auto d-print-none text-end">
                    <div class="btn-list">
                        <a
                            onclick="history.back()"
                            class="btn btn-ghost-secondary d-none d-sm-inline-block pe-0 ps-3"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-arrow-left"
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                fill="none"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M5 12l14 0"></path>
                                <path d="M5 12l6 6"></path>
                                <path d="M5 12l6 -6"></path>
                            </svg>
                        </a>
                        <A href="/objects/create" class="btn btn-primary d-none d-sm-inline-block">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon"
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                stroke-width="2"
                                stroke="currentColor"
                                fill="none"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M12 5l0 14"></path>
                                <path d="M5 12l14 0"></path>
                            </svg>
                            Create new
                        </A>
                    </div>
                </div>
            </div>
            <div class="row mt-2">
                <div class="col">
                    {element}
                </div>
            </div>
        </div>
    }
}

#[server(UserResources, "/api", "GetJson")]
pub async fn get_user_resources(
    #[server(default)] query: GetOwnedResources,
) -> Result<Vec<Resource>, ServerFnError> {
    use crate::utils::aruna_api_handlers::get_owned_resources;
    let res = get_owned_resources(query.perms, query.token)
        .await
        .map_err(|_| {
            leptos::logging::log!("Unable to query owned resources");
            ServerFnError::Request("Error accessing UserResources".to_string())
        })?;
    Ok(res)
}
