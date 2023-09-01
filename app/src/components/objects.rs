use crate::utils::{
    mocks::get_mock_by_id,
    structs::{SearchResultEntry, VisualizedStats, WebRelation},
    tabler_utils::{add_bg_color, add_text_color, Colors},
};
use leptos::*;
use leptos_router::*;

#[derive(Params, PartialEq, Debug)]
struct ObjectParams {
    id: String,
}

#[component]
pub fn ObjectOverview() -> impl IntoView {
    let params = use_params::<ObjectParams>();
    let res = move || {
        params.with(|params| {
            params
                .as_ref()
                .map(|params| params.id.clone())
                .unwrap_or_default()
        })
    };
    let res = move || get_mock_by_id(res());
    let entry = move || SearchResultEntry::from(res());
    let _name = move || entry().name.to_string();
    let id = move || entry().id.to_string();

    let header = move || {
        view! {
            <div class="container-xl">
                <div class="row g-2">
                    <div class="col">
                        <div class="page-pretitle text-start">
                            Overview
                        </div>
                        <h2 class="page-title">
                            Resource
                        </h2>
                    </div>
                    <div class="col-auto ms-auto d-print-none">
                        <div class="btn-list">
                            <a
                                href="#"
                                class="btn btn-primary d-none d-sm-inline-block"
                                data-bs-toggle="modal"
                                data-bs-target="#modal-report"
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
                                Create new Resource
                            </a>
                            <a
                                href="#"
                                class="btn btn-primary d-sm-none btn-icon"
                                data-bs-toggle="modal"
                                data-bs-target="#modal-report"
                                aria-label="Create new report"
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
                            </a>
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
            <div class="col-sm-12 col-lg-4">
                <div class="card card-sm">
                    <div class="card-body p-2">
                        <div class="row align-items-center">
                            {get_icon(id.clone(), color)} <div class="col-auto">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">{id}</div>
                                    <div class=add_text_color(
                                        "h2 mb-0",
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
            <div class="col-sm-12 col-lg-4">
                <div class="card card-sm">
                    <div class="card-body p-2">
                        <div class="row align-items-center">
                            {get_icon("Stats".to_string(), Colors::Green)}
                            <div class="col-auto me-6">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">
                                        Count
                                    </div>
                                    <div class=add_text_color(
                                        "h2 mb-0",
                                        Colors::Muted,
                                    )>{stats.count}</div>
                                </div>
                            </div> <div class="col-auto border-start">
                                <div class="ms-2 text-start card-text text-nowrap align-items-center">
                                    <div class="text-muted">
                                        Size
                                    </div>
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
            <div class="col-12">
                <div class="card card">
                    <div class="card-body">
                        <div class="align-items-center">
                            <div class="col-auto me-6">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <h3 class="h2 text-secondary">
                                        Description
                                    </h3>
                                    <div class="text-muted">{description}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let relations = move || {
        let (a, b): (Vec<_>, Vec<_>) = entry()
            .relations
            .clone()
            .into_iter()
            .partition(|x| x.is_external());
        (a, b)
    };

    let relations = move || {
        let (external, internal) = relations();

        view! {
            <div class="col-sm-12 col-lg-6">
                <div class="card">
                    <div class="card-header m-0">
                        <span class="text-secondary icon-lg me-2">
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
                        <h3 class="h2 text-secondary mb-0 align-items-top">
                            External relations
                        </h3>
                    </div>
                    <div class="card-table table-responsive ">
                        <table class="table table-vcenter">
                            <thead>
                                <tr>
                                    <th class="text-start">
                                        URL
                                    </th>
                                    <th>
                                        TYPE
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                            /
                                        </a>
                                    </td>
                                    <td>
                                        <span class="status status-blue">
                                            DOI
                                        </span>
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                        </a>
                                        /form-elements.html
                                    </td>
                                    <td class="text-secondary">
                                        3,652
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                        </a>
                                        /index.html
                                    </td>
                                    <td class="text-secondary">
                                        3,256
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                            /icons.html
                                        </a>
                                    </td>
                                    <td class="text-secondary">
                                        986
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                            /docs/
                                        </a>

                                    </td>
                                    <td class="text-secondary">
                                        912
                                    </td>
                                </tr>
                                <tr>
                                    <td class="text-start">
                                        <a href="#" class="ms-1" aria-label="Open website">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon me-2"
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
                                                <path d="M9 15l6 -6"></path>
                                                <path d="M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464"></path>
                                                <path d="M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463"></path>
                                            </svg>
                                            /accordion.html
                                        </a>
                                    </td>
                                    <td class="text-secondary">
                                        855
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-sm-12 col-lg-6">
                <div class="card card">
                    <div class="card-body">
                        <div class="align-items-center">
                            <div class="col-auto me-6">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <h3 class="h2 text-secondary">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            class="icon icon-tabler icon-tabler-file-symlink"
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
                                            <path d="M4 21v-4a3 3 0 0 1 3 -3h5"></path>
                                            <path d="M9 17l3 -3l-3 -3"></path>
                                            <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                                            <path d="M5 11v-6a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-9.5"></path>
                                        </svg>
                                        Internal relations
                                    </h3>
                                    <div class="text-muted">
                                        description
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        }
    };

    let card_deck = move || {
        view! {
            <div class="row row-deck row-cards">
                {small_card(("Name".to_string(), _name(), Colors::Primary, Some(Colors::Primary)))}
                {small_card(("ID".to_string(), id(), Colors::Primary, Some(Colors::Primary)))}
                {stats_card(entry().stats)} {full_card(entry().description)} {relations}
            </div>
        }
    };

    view! {
        <div class="page-wrapper d-print-none">
            <div class="page-header">{header}</div>
            <div class="page-body">
                <div class="container-xl">{card_deck}</div>
            </div>
        </div>
    }
}
