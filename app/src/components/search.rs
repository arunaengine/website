use crate::utils::structs::{
    DataClass, Filter, JsonFilter, ResourceType, SearchQuery, SearchResultEntry,
};
use aruna_rust_api::api::storage::{
    models::v2::generic_resource::Resource, services::v2::SearchResourcesResponse,
};
use leptos::*;
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

#[server]
async fn search_api(query: SearchQuery) -> Result<SearchResourcesResponse, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use axum_extra::extract::CookieJar;

    let req_parts = use_context::<leptos_axum::RequestParts>()
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;
    let jar = CookieJar::from_headers(&req_parts.headers);

    let token = if let Some(cookie) = jar.get("token") {
        Some(cookie.value().to_string())
    } else {
        None
    };
    let res = ConnectionHandler::search(token, query).await.map_err(|_| {
        leptos::logging::log!("Unable to query SearchResults");
        ServerFnError::Request("Error accessing SearchResult".to_string())
    })?;
    Ok(res)
}

#[component]
pub fn Search() -> impl IntoView {
    let (query, _query_set) = create_query_signal::<String>("query");
    let (query_filter, query_set_filter_p) = create_query_signal::<JsonFilter>("filter");
    let (read_range, set_range) = create_signal(1..=5);
    let (results, set_results) = create_signal::<i32>(0);

    let update_filter = move |filter: Filter| {
        let current_filter = query_filter().unwrap_or_default();
        query_set_filter_p(current_filter.update_filter(filter));
    };

    let max_pages = move || (results() / 50) + 1;
    let get_range_iter = move |current: i32| {
        let max = max_pages();
        let from = if current > 3 { current - 2 } else { 1 };
        let to = if current + 2 < max { current + 2 } else { max };
        if to < 5 {
            return 1..=max;
        }

        if to + 2 > max {
            return (max - 4)..=max;
        }

        from..=to
    };

    let (query_page, query_set_page_p) = create_query_signal::<i32>("page");
    let query_set_page = move |size: i32| {
        set_range(get_range_iter(size));
        query_set_page_p(Some(size));
    };

    let inc_page = move || {
        let page = query_page().unwrap_or(1);
        if page == max_pages() {
            return;
        }
        set_range(get_range_iter(page + 1));
        query_set_page(page + 1);
    };

    let dec_page = move || {
        let page = query_page().unwrap_or(1);
        if page == 1 {
            return;
        }
        query_set_page(page - 1);
    };

    let current_page = move || query_page().unwrap_or(1);

    let pagination = move || {
        view! {
            <Show
            when=move || (max_pages() > 1)
            fallback=|| ().into_view()
            >
            <div class="mt-1 align-items-end">
                <ul class="pagination">
                    <li class=move || {
                        if current_page() == 1 { "page-item disabled" } else { "page-item" }
                    }>
                        <button
                            class="page-link"
                            on:click=move |_| dec_page()
                            aria-disabled=move || if current_page() == 1 { "true" } else { "false" }
                        >
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
                                <path d="M15 6l-6 6l6 6"></path>
                            </svg>
                        </button>
                    </li>

                    <For
                        each=move || { read_range() }
                        key=|num| *num
                        children=move |num| {
                            view! {
                                <li class=move || {
                                    if query_page().unwrap_or(1) == num {
                                        "page-item active"
                                    } else {
                                        "page-item"
                                    }
                                }>
                                    <button class="page-link" on:click=move |_| query_set_page(num)>
                                        {num}
                                    </button>
                                </li>
                            }
                        }
                    />

                    <li class=move || if current_page() == max_pages() { "page-item disabled" } else { "page-item" }>
                        <button
                            class="page-link"
                            aria-disabled=move || if current_page() == max_pages() { "true" } else { "false" }
                            on:click=move |_| inc_page()>
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
                                <path d="M9 6l6 6l-6 6"></path>
                            </svg>
                        </button>
                    </li>
                </ul>
            </div>
            </Show>
        }
    };

    let query = move || SearchQuery {
        query: query().unwrap_or_default(),
        filter: query_filter().unwrap_or_default().into_filter_string(), //query_filter().unwrap_or_default(),
        limit: 50,
        offset: (current_page() as i64 - 1) * 50,
    };
    let resource = create_local_resource(move || query(), search_api);

    let query_data = move || {
        view! {
            <Suspense fallback=move || view!{ <p>"Loading resources ..." </p>}>
                {move || {
                    resource.get().map(|result| match result {
                        Ok(res) => {
                            let resources = res.resources.into_iter().map(|gen_res| gen_res.resource.unwrap()).collect::<Vec<Resource>>();
                            let num = resources.len();

                            set_results(res.estimated_total as i32);
                            query_set_page(current_page());

                            view! {
                                {pagination}
                                <For
                                each=move || { resources.clone().into_iter() }
                                key=|res| {
                                    match res {
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
                                <Show
                                    when=move || (num == 0)
                                    fallback=|| ().into_view()
                                >
                                    <div class="d-flex">
                                        <h2 class="text-muted">
                                            "No results found"
                                        </h2>
                                    </div>

                                </Show>
                            }.into_view()
                        },
                        Err(e)=> {
                            leptos::logging::log!("{e:?}");
                            view!{<p> "Error while searching resources" </p>}.into_view()
                        }
                    })
                }
            }
            </Suspense>
        }
        .into_view()
    };

    view! {
        <div class="container-xl text-start mt-4">
            <div class="row mt-2">
                <div class="col-3">
                    <h2 class="text-primary">"Search results"</h2>
                    <div class="text-secondary">"About " {results} " results"</div> //result (0.19 seconds)"</div>
                </div>
                <div class="col-9 pe-4">
                    <div class="input-group">
                        <label for="formFile" class="input-group-text">
                            <div class="col-auto d-flex">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-search-icon icon-tabler icon-tabler-search"
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
                                    <path d="M10 10m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0"></path>
                                    <path d="M21 21l-6-6"></path>
                                </svg>
                            </div>
                        </label>
                        <input
                            type="text"
                            class="form-control form-control-lg"
                            placeholder="Search Aruna objects"
                            on:input=move |_| resource.refetch()
                        />
                        <span class="input-group-text" id="inputGroup-sizing-default">
                            Dataclass
                        </span>
                        <button
                            class="btn btn-outline-secondary dropdown-toggle"
                            type="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            {move || {
                                query_filter().map(|e| e.get_class()).unwrap_or("All".to_string())
                            }}

                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li>
                                <button
                                    on:click=move |_| update_filter(Filter::DataClass(None))
                                    class="dropdown-item"
                                >
                                    All
                                </button>
                            </li>
                            <li>
                                <button
                                    on:click=move |_| update_filter(Filter::DataClass(Some(DataClass::PUBLIC)))
                                    class="dropdown-item"
                                >
                                    Public
                                </button>
                            </li>
                            <li>
                                <button
                                    on:click=move |_| update_filter(Filter::DataClass(Some(DataClass::PRIVATE)))
                                    class="dropdown-item"
                                >
                                    Private
                                </button>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="row mt-4">
                    <div class="col-3">
                        <h3 class="text-muted">"Filters"</h3>
                        <div class="subheader mb-2">"Resource"</div>
                        <div class="list-group list-group-transparent mb-3">
                            <button
                                on:click=move |_| update_filter(Filter::ObjectType(None))
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if query_filter().map(|e| e.res_selected(None)).unwrap_or(true) {
                                            " active"
                                        } else {
                                            ""
                                        }
                                }
                            >

                                "All"
                            </button>
                            <button
                                on:click=move |_| update_filter(Filter::ObjectType(Some(ResourceType::Project)))
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if query_filter().map(|e| e.res_selected(Some(ResourceType::Project))).unwrap_or_default() { " active" } else { "" }
                                }
                            >

                                "Projects"
                            </button>
                            <button
                                on:click=move |_| update_filter(Filter::ObjectType(Some(ResourceType::Collection)))
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        +  if query_filter().map(|e| e.res_selected(Some(ResourceType::Collection))).unwrap_or_default() { " active" } else { "" }
                                }
                            >

                                "Collections"
                            </button>
                            <button
                                on:click=move |_| update_filter(Filter::ObjectType(Some(ResourceType::Dataset)))
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        +  if query_filter().map(|e| e.res_selected(Some(ResourceType::Dataset))).unwrap_or_default() { " active" } else { "" }
                                }
                            >

                                "Datasets"
                            </button>
                            <button
                                on:click=move |_| update_filter(Filter::ObjectType(Some(ResourceType::Object)))
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned() + if query_filter().map(|e| e.res_selected(Some(ResourceType::Object))).unwrap_or_default() { " active" } else { "" }
                                }
                            >

                                "Objects"
                            </button>
                        </div>
                        <div class="subheader mb-4">"Filters"</div>

                        <div class="input-group mb-3">
                            <input
                                type="text"
                                class="form-control"
                                placeholder="Filter string"
                                aria-label="Filter string"
                                on:change=move |e| { resource.refetch(); update_filter(Filter::Custom(Some(event_target_value(&e)))) }
                            />
                        </div>

                        <div class="alert alert-success" role="alert">
                            <div class="alert-title">
                                Filter arguments by value.
                            </div>
                            <div class="text-muted mt-2">
                                E.g:
                                <b>"size > 100"</b>
                                ,
                                <b>"labels.key = akey"</b>
                            </div>
                            <div class="text-secondary mt-2 mb-2">
                                Current available parameters are:
                            </div>
                            <div class="text-secondary">
                                <b>
                                    size
                                </b>
                                ,
                                <b>
                                    labels.key
                                </b>
                                ,
                                <b>
                                    labels.value
                                </b>
                                ,
                                <b>
                                    created_at
                                </b>
                            </div>
                        </div>
                    </div>
                    <div class="col-9 ps-3">

                        {query_data}


                    </div>
                </div>
            </div>
        </div>
    }
}
