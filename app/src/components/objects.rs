use crate::utils::{
    structs::{ObjectInfo, VisualizedStats},
    tabler_utils::{add_bg_color, add_text_color, Colors},
};
use aruna_rust_api::api::storage::services::v2::ResourceWithPermission;
use leptos::*;
use leptos_router::*;
use serde::{Deserialize, Serialize};

#[derive(Params, PartialEq, Debug)]
struct ObjectParams {
    id: String,
}

#[derive(PartialEq, Debug, Serialize, Deserialize, Clone)]
struct GetObjectQuery {
    pub id: String,
}

#[server(GetObject, "/api", "GetJson")]
pub async fn get_object_by_id(
    query: GetObjectQuery,
) -> Result<ResourceWithPermission, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};
    use http::header;
    use http::StatusCode;
    use leptos_axum::ResponseOptions;

    let maybe_token = match extract_token().await {
        LoginResult::ValidToken(token) => Some(token),
        _ => None,
    };

    //Overwrite the response status and options if everything went well
    if let Some(response_options) = use_context::<ResponseOptions>() {
        response_options.set_status(StatusCode::OK);
        response_options.insert_header(
            header::LOCATION,
            header::HeaderValue::from_str("").expect("Failed to create HeaderValue"),
        );
    };

    match ConnectionHandler::aruna_get_resource(maybe_token, query.id).await {
        Ok(res) => return Ok(res),
        _ => {
            return Err(ServerFnError::Request(
                "Invalid request: UserResources".to_string(),
            ));
        }
    }
}

#[component]
pub fn ObjectOverview() -> impl IntoView {
    // Gets id
    let params = use_params::<ObjectParams>();

    // Converts id
    let get_params = move || {
        params.with(|params| {
            params
                .as_ref()
                .map(|params| params.id.clone())
                .unwrap_or_default()
        })
    };

    let args = move || GetObjectQuery {
        id: get_params().clone(),
    };
    // Create leptos::Resource for ServerFn
    let resource = create_local_resource(args, move |query: GetObjectQuery| async move {
        leptos::logging::log!("Running inside closure");
        let result = get_object_by_id(query).await;
        leptos::logging::log!("{result:?}");
        result.ok()
    });

    // Uses entry
    //let _entry = move |value: APIResource| SearchResultEntry::from(value);
    let name = move |entry: ObjectInfo| entry.name.to_string();
    let id = move |entry: ObjectInfo| entry.id.to_string();

    // This is ugly, but leptos::Recource cant get loaded outside of views
    // and because SearchResult does not implement view, everything now needs to be matched
    // accordingly

    let header = move || {
        view! {
            <div class="container-xl">
                <div class="row g-2">
                    <div class="col">
                        <div class="page-pretitle text-start">Overview</div>
                        <h2 class="page-title">Resource</h2>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
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

                            <a
                                href="#"
                                class="btn btn-green d-none d-sm-inline-block"
                                data-bs-toggle="modal"
                                data-bs-target="#modal-report"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-pencil"
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
                                    <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"></path>
                                    <path d="M13.5 6.5l4 4"></path>
                                </svg>
                                Edit
                            </a>
                            <A
                                href="/objects/create"
                                class="btn btn-primary d-none d-sm-inline-block"
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
                                    <path d="M12 5l0 14"></path>
                                    <path d="M5 12l14 0"></path>
                                </svg>
                                Create new
                            </A>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let get_icon = move |id: String, color: Colors| match id.as_str() {
        "ID" => view! {
            <div class="col-auto ms-2">
                <span class=add_bg_color("text-white avatar", color)>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="icon icon-tabler icon-tabler-cylinder"
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
                        <path d="M12 6m-7 0a7 3 0 1 0 14 0a7 3 0 1 0 -14 0"></path>
                        <path d="M5 6v12c0 1.657 3.134 3 7 3s7 -1.343 7 -3v-12"></path>
                    </svg>
                </span>
            </div>
        },

        "Name" => view! {
            <div class="col-auto ms-2">
                <span class=add_bg_color("text-white avatar", color)>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="icon icon-tabler icon-tabler-file-text"
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
                        <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                        <path d="M9 9l1 0"></path>
                        <path d="M9 13l6 0"></path>
                        <path d="M9 17l6 0"></path>
                    </svg>
                </span>
            </div>
        },

        "Stats" => view! {
            <div class="col-auto ms-2">
                <span class=add_bg_color("text-white avatar", color)>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="icon icon-tabler icon-tabler-file-analytics"
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
                        <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                        <path d="M9 17l0 -5"></path>
                        <path d="M12 17l0 -1"></path>
                        <path d="M15 17l0 -3"></path>
                    </svg>
                </span>
            </div>
        },

        "description" => view! {
            <div class="col-auto ms-2">
                <span class=add_bg_color("text-white avatar", color)>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="icon icon-tabler icon-tabler-file-description"
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
                        <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                        <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                        <path d="M9 17h6"></path>
                        <path d="M9 13h6"></path>
                    </svg>
                </span>
            </div>
        },
        _ => {
            view! {
                <div class="col-auto ms-2">
                    <span class=add_bg_color("text-white avatar", color)>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-cylinder"
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
                            <path d="M12 6m-7 0a7 3 0 1 0 14 0a7 3 0 1 0 -14 0"></path>
                            <path d="M5 6v12c0 1.657 3.134 3 7 3s7 -1.343 7 -3v-12"></path>
                        </svg>
                    </span>
                </div>
            }
        }
    };

    let small_card = move |(id, text, color, text_color): (
        String,
        String,
        Colors,
        Option<Colors>,
    )| {
        view! {
            <div class="col-sm-12 col-xl-6 col-xxl-4">
                <div class="card card-sm">
                    <div class="card-body p-2">
                        <div class="row align-items-center">
                            {get_icon(id.clone(), color)} <div class="col-auto">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">{id}</div>
                                    <div class=add_text_color(
                                        "h2 mb-0 w-auto",
                                        text_color.unwrap_or_else(|| Colors::Muted),
                                    )>{text}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let stats_card = move |stats: VisualizedStats| {
        view! {
            <div class="col-sm-12 col-xl-6 col-xxl-4">
                <div class="card card-sm">
                    <div class="card-body p-2">
                        <div class="row align-items-center">
                            {get_icon("Stats".to_string(), Colors::Green)}
                            <div class="col-auto me-6">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">Count</div>
                                    <div class=add_text_color(
                                        "h2 mb-0",
                                        Colors::Muted,
                                    )>{stats.count}</div>
                                </div>
                            </div> <div class="col-auto border-start">
                                <div class="ms-2 text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">Size</div>
                                    <div class=add_text_color(
                                        "h2 mb-0",
                                        Colors::Muted,
                                    )>{stats.size}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let full_card = move |description: String| {
        view! {
            <div class="col-lg-12 col-sm-12">
                <div class="card card">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-file-info"
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
                                <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                                <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                                <path d="M11 14h1v4h1"></path>
                                <path d="M12 11h.01"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">Description</h3>
                    </div>
                    <div class="card-body">
                        <div class="align-items-center">
                            <div class="col-auto me-6">
                                <div class="text-start card-text align-items-center">
                                    <div class="text-muted">{description}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let relations = move |entry: ObjectInfo| {
        let (a, b): (Vec<_>, Vec<_>) = entry
            .relations
            .clone()
            .into_iter()
            .partition(|x| x.is_external());
        (a, b)
    };

    let get_labels = move |entry: ObjectInfo| {
        let (a, b): (Vec<_>, Vec<_>) = entry
            .key_values
            .clone()
            .into_iter()
            .partition(|x| x.is_label());
        (a, b)
    };

    let labels = move |entry: ObjectInfo| {
        let (hooks, _) = get_labels(entry);

        view! {
            <div class="col-xl-12 col-xxl-6">
                <div class="card card-body-scrollable card-body-scrollable-shadow">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-tags"
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
                                <path d="M7.859 6h-2.834a2.025 2.025 0 0 0 -2.025 2.025v2.834c0 .537 .213 1.052 .593 1.432l6.116 6.116a2.025 2.025 0 0 0 2.864 0l2.834 -2.834a2.025 2.025 0 0 0 0 -2.864l-6.117 -6.116a2.025 2.025 0 0 0 -1.431 -.593z"></path>
                                <path d="M17.573 18.407l2.834 -2.834a2.025 2.025 0 0 0 0 -2.864l-7.117 -7.116"></path>
                                <path d="M6 9h-.01"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">Labels</h3>
                    </div>
                    <div class="card-table table-responsive">
                        <table class="table table-vcenter text-start">
                            <thead>
                                <tr>
                                    <th class="text-start">KEY</th>
                                    <th>VALUE</th>
                                    <th>STATIC</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each=move || hooks.clone().into_iter().enumerate()
                                    key=|(id, _)| format!("hooks_{}", *id)
                                    children=move |(_, rel)| { rel.into_table_view() }
                                />

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
    };
    let hooks = move |entry: ObjectInfo| {
        let (_, label) = get_labels(entry);

        view! {
            <div class="col-xl-12 col-xxl-6">
                <div class="card">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-webhook"
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
                                <path d="M4.876 13.61a4 4 0 1 0 6.124 3.39h6"></path>
                                <path d="M15.066 20.502a4 4 0 1 0 1.934 -7.502c-.706 0 -1.424 .179 -2 .5l-3 -5.5"></path>
                                <path d="M16 8a4 4 0 1 0 -8 0c0 1.506 .77 2.818 2 3.5l-3 5.5"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">Hooks</h3>
                    </div>
                    <div class="card-table table-responsive ">
                        <table class="table table-vcenter text-start">
                            <thead>
                                <tr>
                                    <th class="text-start">KEY</th>
                                    <th>VALUE</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each=move || label.clone().into_iter().enumerate()
                                    key=|(id, _)| format!("label_{}", *id)
                                    children=move |(_, rel)| { rel.into_table_view() }
                                />

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
    };

    let splitted_relations = move |entry: ObjectInfo| {
        let (ext, int) = relations(entry);

        let (inc, out): (Vec<_>, Vec<_>) = int.into_iter().partition(|x| x.is_incoming());

        (ext, inc, out)
    };

    let ext_relations = move |entry: ObjectInfo| {
        let (external, _, _) = splitted_relations(entry);

        view! {
            <div class="col-xl-12 col-xxl-6">
                <div class="card card-body-scrollable card-body-scrollable-shadow">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-external-link"
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
                                <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                                <path d="M11 13l9 -9"></path>
                                <path d="M15 4h5v5"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">External relations</h3>
                    </div>
                    <div class="card-table table-responsive ">
                        <table class="table table-vcenter text-start">
                            <thead>
                                <tr>
                                    <th class="text-start">URL</th>
                                    <th>TYPE</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each=move || external.clone().into_iter().enumerate()
                                    key=|(id, _)| format!("external_{}", *id)
                                    children=move |(_, rel)| { rel.into_table_view() }
                                />

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
    };

    let int_relations = move |entry: ObjectInfo| {
        let (_, internal_inc, internal_ext) = splitted_relations(entry);

        view! {
            <div class="col-xl-12 col-xxl-6">
                <div class="card">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-arrows-split"
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
                                <path d="M21 17h-8l-3.5 -5h-6.5"></path>
                                <path d="M21 7h-8l-3.495 5"></path>
                                <path d="M18 10l3 -3l-3 -3"></path>
                                <path d="M18 20l3 -3l-3 -3"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">Internal relations</h3>
                    </div>
                    <div class="card-table table-responsive">
                        <table class="table table-vcenter text-start">
                            <thead>
                                <tr>
                                    <th class="text-start">ID</th>
                                    <th>RESOURCE</th>
                                    <th>TYPE</th>
                                </tr>
                            </thead>

                            <thead>
                                <tr>
                                    <th colspan="3">incoming</th>
                                </tr>
                            </thead>

                            <tbody>
                                <For
                                    each=move || internal_inc.clone().into_iter().enumerate()
                                    key=|(id, _)| format!("internal_inc_{}", *id)
                                    children=move |(_, rel)| { rel.into_table_view() }
                                />

                            </tbody>
                            <thead>
                                <tr>
                                    <th colspan="3">outgoing</th>
                                </tr>
                            </thead>
                            <tbody>
                                <For
                                    each=move || internal_ext.clone().into_iter().enumerate()
                                    key=|(id, _)| format!("internal_ext_{}", *id)
                                    children=move |(_, rel)| { rel.into_table_view() }
                                />

                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
    };

    let _endpoints = move || {
        view! {
            <div class="col-xl-12 col-xxl-6">
                <div class="card">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2 mt-1">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-external-link"
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
                                <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                                <path d="M11 13l9 -9"></path>
                                <path d="M15 4h5v5"></path>
                            </svg>
                        </span>
                        <h3 class="h2 text-secondary mb-0 align-items-top">Proxy endpoints</h3>
                    </div>
                    <div class="card-table table-responsive ">
                        <table class="table table-vcenter text-start">
                            <thead>
                                <tr>
                                    <th class="text-start">NAME</th>
                                    <th>LINK</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="text-start">
                                        <span>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon icon-tabler icon-tabler-bucket"
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
                                                <path d="M12 7m-8 0a8 4 0 1 0 16 0a8 4 0 1 0 -16 0"></path>
                                                <path d="M4 7c0 .664 .088 1.324 .263 1.965l2.737 10.035c.5 1.5 2.239 2 5 2s4.5 -.5 5 -2c.333 -1 1.246 -4.345 2.737 -10.035a7.45 7.45 0 0 0 .263 -1.965"></path>
                                            </svg>
                                        </span>
                                        <A href="">gi-public</A>
                                    </td>
                                    <td>
                                        <A href="">"s3://objects/01H93HDRV1ZAJH8AT880CH8C0R"</A>
                                    </td>
                                    <td>
                                        <span class="status status-green">Available</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <span>
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon icon-tabler icon-tabler-bucket"
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
                                                <path d="M12 7m-8 0a8 4 0 1 0 16 0a8 4 0 1 0 -16 0"></path>
                                                <path d="M4 7c0 .664 .088 1.324 .263 1.965l2.737 10.035c.5 1.5 2.239 2 5 2s4.5 -.5 5 -2c.333 -1 1.246 -4.345 2.737 -10.035a7.45 7.45 0 0 0 .263 -1.965"></path>
                                            </svg>
                                        </span>
                                        <A href="">bi-public</A>
                                    </td>
                                    <td>
                                        <A href="">"s3://objects/01H93HDRV1ZAJH8AT880CH8C0R"</A>
                                    </td>
                                    <td>
                                        <span class="status status-red">Unavailable</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        }
    };

    let top_tags = move |entry: ObjectInfo| {
        view! {
            <div class="row">
                <div class="col-auto">{entry.get_type_badge()}</div>
                <div class="col-auto">{entry.get_data_class_badge()}</div>
                <div class="col-auto">{entry.get_status_badge()}</div>
                <div class="col-auto">
                    <span class="badge badge-outline text-primary">CC-BY-SA 4.0</span>
                </div>
                <div class="col-auto">
                    <span class="badge badge-outline text-orange">WRITE</span>
                </div>
            </div>
        }
    };

    let card_deck = move |entry: ObjectInfo| {
        view! {
            <div class="row row-deck row-cards">
                {small_card((
                    "ID".to_string(),
                    id(entry.clone()),
                    Colors::Primary,
                    Some(Colors::Primary),
                ))}
                {small_card((
                    "Name".to_string(),
                    name(entry.clone()),
                    Colors::Primary,
                    Some(Colors::Primary),
                ))} {stats_card(entry.clone().stats)} {full_card(entry.clone().description)}
                {labels(entry.clone())} {hooks(entry.clone())} //{endpoints()}
                {ext_relations(entry.clone())} {int_relations(entry.clone())}
            </div>
        }
    };
    let main = move || {
        view! {
            <Suspense fallback=move || {
                view! { <p>"Loading resources ..."</p> }
            }>
                {move || {
                    let resource = move || resource.get().flatten();
                    match resource() {
                        Some(result) => {
                           
                                let entry = move || ObjectInfo::try_from(result.clone()).unwrap();
                                view! {
                                    <div class="page-wrapper d-print-none">
                                        <div class="page-header">{header}</div>
                                        <div class="page-body mt-2">
                                            <div class="container-xl mb-2">
                                                {top_tags(entry().clone())}
                                            </div>
                                            <div class="container-xl">{card_deck(entry())}</div>
                                        </div>
                                    </div>
                                }
                                    .into_view()
                        }
                        None => view! { <p>"No resource found"</p> }.into_view(),
                    }
                }}

            </Suspense>
        }
    };
    main
}
