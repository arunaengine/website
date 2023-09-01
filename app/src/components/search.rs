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
                            <A class="text-primary" href=absolute_link() replace=true>
                                <h3>{name}</h3>
                            </A>
                            <A class="subheader" href=absolute_link() replace=true>
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
pub fn Search() -> impl IntoView {
    let (query_class, query_set_class_p) = create_query_signal::<String>("class");
    let (query_res, query_set_res_p) = create_query_signal::<String>("filter_res");

    let query_set_class = move |class: &str| {
        query_set_class_p(Some(class.to_string()));
    };

    let query_set_res = move |res: &str| {
        query_set_res_p(Some(res.to_string()));
    };

    // let is_class = move |class: &str| query_class() == Some(class.to_string());
    let is_res = move |res: &str| query_res() == Some(res.to_string());

    let (read_range, set_range) = create_signal(1..=5);

    let (results, _set_results) = create_signal::<i32>(1337);
    let max_pages = move || (results() / 50) + 1;
    let get_range_iter = {
        move |current: i32| {
            let max = max_pages();
            let from = if current > 3 { current - 2 } else { 1 };
            let to = if current + 2 < max { current + 2 } else { max };
            if to < 5 {
                return 1..=5;
            }

            if to + 2 > max {
                return (max - 4)..=max;
            }

            from..=to
        }
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
                        view=move |num| {
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

                    <li class="page-item">
                        <button class="page-link" on:click=move |_| inc_page()>
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
        }
    };

    view! {
        <div class="container-xl text-start mt-4">
            <div class="row mt-2">
                <div class="col-3">
                    <h2 class="text-primary">"Search results"</h2>
                    <div class="text-secondary">"About " {results} " result (0.19 seconds)"</div>
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
                                let s = query_class().unwrap_or("all".to_string());
                                format!("{}{}", (& s[..1].to_string()).to_uppercase(), & s[1..])
                            }}

                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li>
                                <button
                                    on:click=move |_| query_set_class("all")
                                    class="dropdown-item"
                                >
                                    All
                                </button>
                            </li>
                            <li>
                                <button
                                    on:click=move |_| query_set_class("public")
                                    class="dropdown-item"
                                >
                                    Public
                                </button>
                            </li>
                            <li>
                                <button
                                    on:click=move |_| query_set_class("private")
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
                                on:click=move |_| query_set_res("all")
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if is_res("all") || query_res().is_none() {
                                            " active"
                                        } else {
                                            ""
                                        }
                                }
                            >

                                "All"
                            </button>
                            <button
                                on:click=move |_| query_set_res("projects")
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if is_res("projects") { " active" } else { "" }
                                }
                            >

                                "Projects"
                            </button>
                            <button
                                on:click=move |_| query_set_res("collections")
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if is_res("collections") { " active" } else { "" }
                                }
                            >

                                "Collections"
                            </button>
                            <button
                                on:click=move |_| query_set_res("datasets")
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned()
                                        + if is_res("datasets") { " active" } else { "" }
                                }
                            >

                                "Datasets"
                            </button>
                            <button
                                on:click=move |_| query_set_res("objects")
                                class=move || {
                                    "list-group-item list-group-item-action d-flex align-items-center"
                                        .to_owned() + if is_res("objects") { " active" } else { "" }
                                }
                            >

                                "Objects"
                            </button>
                        </div>
                        <div class="subheader mb-4">"Query filters"</div>

                        <div class="input-group mb-3">
                            <input
                                type="text"
                                class="form-control"
                                placeholder="Query string"
                                aria-label="Query string"
                            />
                        </div>

                        <div class="alert alert-success" role="alert">
                            <div class="alert-title">
                                A query string to filter arguments.
                            </div>
                            <div class="text-secondary">
                                Current parameters are:
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
                            <div class="text-muted">
                                Examples:
                                <b>
                                    size>100
                                </b>
                                ,
                                <b>
                                    labels.key=akey
                                </b>
                                ...
                            </div>
                        </div>
                    </div>
                    <div class="col-9 ps-3">

                        {pagination}
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
        </div>
    }
}
