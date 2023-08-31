use crate::utils::structs::SearchResultEntry;
use aruna_rust_api::api::storage::models::v2::{
    generic_resource::Resource, Collection, Dataset, KeyValue, Object, Project, Stats,
};
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn SearchResult(res: Resource) -> impl IntoView {
    let entry = SearchResultEntry::from(res);
    view! {
        <div class="card mt-2">
            {entry.get_card_status()}
            <div class="card-body d-flex container flex-column">
                {entry.get_ribbon()}
                <div class="row">
                    <div class="col-4">
                        <div>
                            <h3 class="text-primary">{entry.name.to_string()}</h3>
                            <h4 class="subheader">{entry.id.to_string()}</h4>
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
    let resources = vec![
        Resource::Collection(Collection {
            id: "SRE-20001-22000".to_string(),
            name: "SRE-20001-22000".to_string(),
            description: "A metagenomic dataset from somewhere!".to_string(),
            key_values: vec![KeyValue {
                key: "experiment".to_string(),
                value: "Plasmidhunter".to_string(),
                ..Default::default()
            }],
            stats: Some(Stats {
                count: 1,
                size: 882131238,
                last_updated: None,
            }),
            data_class: 1,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 10,
            data_class: 2,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 123123123123123123,
            data_class: 2,
            ..Default::default()
        }),
        Resource::Project(Project {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            stats: Some(Stats {
                count: 1123123,
                size: 123,
                last_updated: None,
            }),
            data_class: 2,
            ..Default::default()
        }),
        Resource::Object(Object {
            id: "01H93HDRV1ZAJH8AT880CH8C0R".to_string(),
            name: "SRE-123123-1231231231".to_string(),
            description: "A biodiversic biodiversity experiment from somewhere!".to_string(),
            key_values: vec![
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
                KeyValue {
                    key: "experiment".to_string(),
                    value: "Plasmidhunter".to_string(),
                    ..Default::default()
                },
            ],
            content_len: 123123123,
            data_class: 2,
            ..Default::default()
        }),
    ];

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

    view! {
        <div class="container-xl text-start mt-4">
            <div class="row mt-2">
                <div class="col-3">
                    <h2 class="text-primary">"Search results"</h2>
                    <div class="text-secondary">"About 2,410 result (0.19 seconds)"</div>
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
                            { move || query_class().unwrap_or("All".to_string()) }
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li>
                                <button on:click=move |_| query_set_class("All") class="dropdown-item" >
                                    All
                                </button>
                            </li>
                            <li>
                                <button on:click=move |_| query_set_class("Public") class="dropdown-item" >
                                    Public
                                </button>
                            </li>
                            <li>
                                <button on:click=move |_| query_set_class("Private") class="dropdown-item" >
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
                                    on:click=move |_| query_set_res("All")
                                    class=move || {
                                        "list-group-item list-group-item-action d-flex align-items-center"
                                            .to_owned() + if is_res("All") || query_res().is_none() { " active" } else { "" }
                                    }
                                >
                                    "All"
                                </button>
                                <button
                                    on:click=move |_| query_set_res("Projects")
                                    class=move || {
                                        "list-group-item list-group-item-action d-flex align-items-center"
                                            .to_owned() + if is_res("Projects") { " active" } else { "" }
                                    }
                                >
                                    "Projects"
                                </button>
                                <button
                                    on:click=move |_| query_set_res("Collections")
                                    class=move || {
                                        "list-group-item list-group-item-action d-flex align-items-center"
                                            .to_owned() + if is_res("Collections") { " active" } else { "" }
                                    }
                                >
                                    "Collections"
                                </button>
                                <button
                                    on:click=move |_| query_set_res("Datasets")
                                    class=move || {
                                        "list-group-item list-group-item-action d-flex align-items-center"
                                            .to_owned() + if is_res("Datasets") { " active" } else { "" }
                                    }
                                >
                                    "Datasets"
                                </button>
                                <button
                                    on:click=move |_| query_set_res("Objects")
                                    class=move || {
                                        "list-group-item list-group-item-action d-flex align-items-center"
                                            .to_owned() + if is_res("Objects") { " active" } else { "" }
                                    }
                                >
                                    "Objects"
                                </button>
                            </div>
                    </div>
                    <div class="col-9 ps-3">
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
