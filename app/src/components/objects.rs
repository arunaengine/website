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
                <div class="card card">
                    <div class="card-body">
                        <div class="align-items-center">
                            <div class="col-auto me-6">
                                <div class="text-start card-text text-nowrap align-items-center">
                                    <h3 class="h2 text-secondary">
                                        External relations
                                    </h3>
                                    <div class="card-table table-responsive">
                                        <table class="table table-vcenter">
                                            <thead>
                                                <tr>
                                                    <th>
                                                        Page name
                                                    </th>
                                                    <th>
                                                        Visitors
                                                    </th>
                                                    <th>
                                                        Unique
                                                    </th>
                                                    <th colspan="2">
                                                        Bounce rate
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>
                                                        /
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        4,896
                                                    </td>
                                                    <td class="text-secondary">
                                                        3,654
                                                    </td>
                                                    <td class="text-secondary">
                                                        82.54%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-1"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexchartsojgojinp"
                                                                class="apexcharts-canvas apexchartsojgojinp apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29508"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29512"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29545"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29510"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29509">
                                                                            <clipPath id="gridRectMaskojgojinp">
                                                                                <rect
                                                                                    id="SvgjsRect29514"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMaskojgojinp"></clipPath>
                                                                            <clipPath id="nonForecastMaskojgojinp"></clipPath>
                                                                            <clipPath id="gridRectMarkerMaskojgojinp">
                                                                                <rect
                                                                                    id="SvgjsRect29515"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29513"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29521" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29522"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29525"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29526"
                                                                                    x1="0"
                                                                                    y1="6"
                                                                                    x2="64"
                                                                                    y2="6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29527"
                                                                                    x1="0"
                                                                                    y1="12"
                                                                                    x2="64"
                                                                                    y2="12"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29528"
                                                                                    x1="0"
                                                                                    y1="18"
                                                                                    x2="64"
                                                                                    y2="18"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29529"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29523"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29531"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29530"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29516"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29517"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29520"
                                                                                    d="M 0 7 L 8 0 L 16 4 L 24 14 L 32 19 L 40 23 L 48 20 L 56 6 L 64 11"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMaskojgojinp)"
                                                                                    pathTo="M 0 7 L 8 0 L 16 4 L 24 14 L 32 19 L 40 23 L 48 20 L 56 6 L 64 11"
                                                                                    pathFrom="M -1 24 L -1 24 L 8 24 L 16 24 L 24 24 L 32 24 L 40 24 L 48 24 L 56 24 L 64 24"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29518"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29519"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29524"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29532"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29533"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29534"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29535"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, -4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29546"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29547"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29548"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        /form-elements.html
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        3,652
                                                    </td>
                                                    <td class="text-secondary">
                                                        3,215
                                                    </td>
                                                    <td class="text-secondary">
                                                        76.29%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-2"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexcharts5wxl1xoq"
                                                                class="apexcharts-canvas apexcharts5wxl1xoq apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29549"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29553"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29587"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29551"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29550">
                                                                            <clipPath id="gridRectMask5wxl1xoq">
                                                                                <rect
                                                                                    id="SvgjsRect29555"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMask5wxl1xoq"></clipPath>
                                                                            <clipPath id="nonForecastMask5wxl1xoq"></clipPath>
                                                                            <clipPath id="gridRectMarkerMask5wxl1xoq">
                                                                                <rect
                                                                                    id="SvgjsRect29556"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29554"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29562" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29563"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29566"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29567"
                                                                                    x1="0"
                                                                                    y1="4.8"
                                                                                    x2="64"
                                                                                    y2="4.8"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29568"
                                                                                    x1="0"
                                                                                    y1="9.6"
                                                                                    x2="64"
                                                                                    y2="9.6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29569"
                                                                                    x1="0"
                                                                                    y1="14.399999999999999"
                                                                                    x2="64"
                                                                                    y2="14.399999999999999"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29570"
                                                                                    x1="0"
                                                                                    y1="19.2"
                                                                                    x2="64"
                                                                                    y2="19.2"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29571"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29564"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29573"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29572"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29557"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29558"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29561"
                                                                                    d="M 0 11.520000000000001 L 8 13.440000000000001 L 16 5.760000000000002 L 24 2.8800000000000026 L 32 12.48 L 40 17.28 L 48 10.56 L 56 21.12 L 64 3.84"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMask5wxl1xoq)"
                                                                                    pathTo="M 0 11.520000000000001 L 8 13.440000000000001 L 16 5.760000000000002 L 24 2.8800000000000026 L 32 12.48 L 40 17.28 L 48 10.56 L 56 21.12 L 64 3.84"
                                                                                    pathFrom="M -1 24 L -1 24 L 8 24 L 16 24 L 24 24 L 32 24 L 40 24 L 48 24 L 56 24 L 64 24"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29559"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29560"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29565"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29574"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29575"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29576"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29577"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, -4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29588"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29589"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29590"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        /index.html
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        3,256
                                                    </td>
                                                    <td class="text-secondary">
                                                        2,865
                                                    </td>
                                                    <td class="text-secondary">
                                                        72.65%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-3"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexchartsh4wsvc1v"
                                                                class="apexcharts-canvas apexchartsh4wsvc1v apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29591"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29595"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29629"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29593"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29592">
                                                                            <clipPath id="gridRectMaskh4wsvc1v">
                                                                                <rect
                                                                                    id="SvgjsRect29597"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMaskh4wsvc1v"></clipPath>
                                                                            <clipPath id="nonForecastMaskh4wsvc1v"></clipPath>
                                                                            <clipPath id="gridRectMarkerMaskh4wsvc1v">
                                                                                <rect
                                                                                    id="SvgjsRect29598"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29596"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29604" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29605"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29608"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29609"
                                                                                    x1="0"
                                                                                    y1="4.8"
                                                                                    x2="64"
                                                                                    y2="4.8"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29610"
                                                                                    x1="0"
                                                                                    y1="9.6"
                                                                                    x2="64"
                                                                                    y2="9.6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29611"
                                                                                    x1="0"
                                                                                    y1="14.399999999999999"
                                                                                    x2="64"
                                                                                    y2="14.399999999999999"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29612"
                                                                                    x1="0"
                                                                                    y1="19.2"
                                                                                    x2="64"
                                                                                    y2="19.2"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29613"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29606"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29615"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29614"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29599"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29600"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29603"
                                                                                    d="M 0 14.4 L 8 11.520000000000001 L 16 14.4 L 24 20.16 L 32 7.68 L 40 21.12 L 48 1.9200000000000017 L 56 2.8800000000000026 L 64 5.760000000000002"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMaskh4wsvc1v)"
                                                                                    pathTo="M 0 14.4 L 8 11.520000000000001 L 16 14.4 L 24 20.16 L 32 7.68 L 40 21.12 L 48 1.9200000000000017 L 56 2.8800000000000026 L 64 5.760000000000002"
                                                                                    pathFrom="M -1 24 L -1 24 L 8 24 L 16 24 L 24 24 L 32 24 L 40 24 L 48 24 L 56 24 L 64 24"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29601"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29602"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29607"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29616"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29617"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29618"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29619"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, -4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29630"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29631"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29632"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        /icons.html
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        986
                                                    </td>
                                                    <td class="text-secondary">
                                                        865
                                                    </td>
                                                    <td class="text-secondary">
                                                        44.89%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-4"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexcharts6oia6g7n"
                                                                class="apexcharts-canvas apexcharts6oia6g7n apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29633"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29637"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29670"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29635"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29634">
                                                                            <clipPath id="gridRectMask6oia6g7n">
                                                                                <rect
                                                                                    id="SvgjsRect29639"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMask6oia6g7n"></clipPath>
                                                                            <clipPath id="nonForecastMask6oia6g7n"></clipPath>
                                                                            <clipPath id="gridRectMarkerMask6oia6g7n">
                                                                                <rect
                                                                                    id="SvgjsRect29640"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29638"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29646" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29647"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29650"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29651"
                                                                                    x1="0"
                                                                                    y1="6"
                                                                                    x2="64"
                                                                                    y2="6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29652"
                                                                                    x1="0"
                                                                                    y1="12"
                                                                                    x2="64"
                                                                                    y2="12"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29653"
                                                                                    x1="0"
                                                                                    y1="18"
                                                                                    x2="64"
                                                                                    y2="18"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29654"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29648"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29656"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29655"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29641"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29642"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29645"
                                                                                    d="M 0 21 L 8 7.5 L 16 10.5 L 24 10.5 L 32 22.5 L 40 19.5 L 48 4.5 L 56 0 L 64 1.5"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMask6oia6g7n)"
                                                                                    pathTo="M 0 21 L 8 7.5 L 16 10.5 L 24 10.5 L 32 22.5 L 40 19.5 L 48 4.5 L 56 0 L 64 1.5"
                                                                                    pathFrom="M -1 30 L -1 30 L 8 30 L 16 30 L 24 30 L 32 30 L 40 30 L 48 30 L 56 30 L 64 30"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29643"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29644"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29649"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29657"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29658"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29659"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29660"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, -4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29671"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29672"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29673"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        /docs/
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        912
                                                    </td>
                                                    <td class="text-secondary">
                                                        822
                                                    </td>
                                                    <td class="text-secondary">
                                                        41.12%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-5"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexcharts3lhp7lnd"
                                                                class="apexcharts-canvas apexcharts3lhp7lnd apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29674"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29679"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29714"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29676"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29675">
                                                                            <clipPath id="gridRectMask3lhp7lnd">
                                                                                <rect
                                                                                    id="SvgjsRect29681"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMask3lhp7lnd"></clipPath>
                                                                            <clipPath id="nonForecastMask3lhp7lnd"></clipPath>
                                                                            <clipPath id="gridRectMarkerMask3lhp7lnd">
                                                                                <rect
                                                                                    id="SvgjsRect29682"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29680"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29688" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29689"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29692"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29693"
                                                                                    x1="0"
                                                                                    y1="4.8"
                                                                                    x2="64"
                                                                                    y2="4.8"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29694"
                                                                                    x1="0"
                                                                                    y1="9.6"
                                                                                    x2="64"
                                                                                    y2="9.6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29695"
                                                                                    x1="0"
                                                                                    y1="14.399999999999999"
                                                                                    x2="64"
                                                                                    y2="14.399999999999999"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29696"
                                                                                    x1="0"
                                                                                    y1="19.2"
                                                                                    x2="64"
                                                                                    y2="19.2"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29697"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29690"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29699"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29698"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29683"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29684"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29687"
                                                                                    d="M 0 22.08 L 7.111111111111111 13.440000000000001 L 14.222222222222221 9.600000000000001 L 21.333333333333332 10.56 L 28.444444444444443 3.84 L 35.55555555555556 4.800000000000001 L 42.666666666666664 16.32 L 49.77777777777778 1.9200000000000017 L 56.888888888888886 6.720000000000002 L 64 10.56"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMask3lhp7lnd)"
                                                                                    pathTo="M 0 22.08 L 7.111111111111111 13.440000000000001 L 14.222222222222221 9.600000000000001 L 21.333333333333332 10.56 L 28.444444444444443 3.84 L 35.55555555555556 4.800000000000001 L 42.666666666666664 16.32 L 49.77777777777778 1.9200000000000017 L 56.888888888888886 6.720000000000002 L 64 10.56"
                                                                                    pathFrom="M -1 24 L -1 24 L 7.111111111111111 24 L 14.222222222222221 24 L 21.333333333333332 24 L 28.444444444444443 24 L 35.55555555555556 24 L 42.666666666666664 24 L 49.77777777777778 24 L 56.888888888888886 24 L 64 24"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29685"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29686"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29691"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29700"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29701"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29702"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29703"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, 4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29715"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29716"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29717"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td>
                                                        /accordion.html
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
                                                    </td>
                                                    <td class="text-secondary">
                                                        855
                                                    </td>
                                                    <td class="text-secondary">
                                                        798
                                                    </td>
                                                    <td class="text-secondary">
                                                        32.65%
                                                    </td>
                                                    <td class="text-end w-1">
                                                        <div
                                                            class="chart-sparkline chart-sparkline-sm"
                                                            id="sparkline-bounce-rate-6"
                                                            style="min-height: 24px;"
                                                        >
                                                            <div
                                                                id="apexchartsci57eaufi"
                                                                class="apexcharts-canvas apexchartsci57eaufi apexcharts-theme-light"
                                                                style="width: 64px; height: 24px;"
                                                            >
                                                                <svg
                                                                    id="SvgjsSvg29718"
                                                                    width="64"
                                                                    height="24"
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    version="1.1"
                                                                    xmlns:xlink="http://www.w3.org/1999/xlink"
                                                                    xmlns:svgjs="http://svgjs.dev"
                                                                    class="apexcharts-svg"
                                                                    xmlns:data="ApexChartsNS"
                                                                    transform="translate(0, 0)"
                                                                    style="background: transparent;"
                                                                >
                                                                    <foreignObject x="0" y="0" width="64" height="24">
                                                                        <div
                                                                            class="apexcharts-legend"
                                                                            xmlns="http://www.w3.org/1999/xhtml"
                                                                            style="max-height: 12px;"
                                                                        ></div>
                                                                    </foreignObject>
                                                                    <rect
                                                                        id="SvgjsRect29723"
                                                                        width="0"
                                                                        height="0"
                                                                        x="0"
                                                                        y="0"
                                                                        rx="0"
                                                                        ry="0"
                                                                        opacity="1"
                                                                        stroke-width="0"
                                                                        stroke="none"
                                                                        stroke-dasharray="0"
                                                                        fill="#fefefe"
                                                                    ></rect>
                                                                    <g
                                                                        id="SvgjsG29758"
                                                                        class="apexcharts-yaxis"
                                                                        rel="0"
                                                                        transform="translate(-18, 0)"
                                                                    ></g>
                                                                    <g
                                                                        id="SvgjsG29720"
                                                                        class="apexcharts-inner apexcharts-graphical"
                                                                        transform="translate(0, 0)"
                                                                    >
                                                                        <defs id="SvgjsDefs29719">
                                                                            <clipPath id="gridRectMaskci57eaufi">
                                                                                <rect
                                                                                    id="SvgjsRect29725"
                                                                                    width="70"
                                                                                    height="26"
                                                                                    x="-3"
                                                                                    y="-1"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                            <clipPath id="forecastMaskci57eaufi"></clipPath>
                                                                            <clipPath id="nonForecastMaskci57eaufi"></clipPath>
                                                                            <clipPath id="gridRectMarkerMaskci57eaufi">
                                                                                <rect
                                                                                    id="SvgjsRect29726"
                                                                                    width="68"
                                                                                    height="28"
                                                                                    x="-2"
                                                                                    y="-2"
                                                                                    rx="0"
                                                                                    ry="0"
                                                                                    opacity="1"
                                                                                    stroke-width="0"
                                                                                    stroke="none"
                                                                                    stroke-dasharray="0"
                                                                                    fill="#fff"
                                                                                ></rect>
                                                                            </clipPath>
                                                                        </defs>
                                                                        <line
                                                                            id="SvgjsLine29724"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="0"
                                                                            y2="24"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="3"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-xcrosshairs"
                                                                            x="0"
                                                                            y="0"
                                                                            width="1"
                                                                            height="24"
                                                                            fill="#b1b9c4"
                                                                            filter="none"
                                                                            fill-opacity="0.9"
                                                                            stroke-width="1"
                                                                        ></line>
                                                                        <g id="SvgjsG29732" class="apexcharts-grid">
                                                                            <g
                                                                                id="SvgjsG29733"
                                                                                class="apexcharts-gridlines-horizontal"
                                                                                style="display: none;"
                                                                            >
                                                                                <line
                                                                                    id="SvgjsLine29736"
                                                                                    x1="0"
                                                                                    y1="0"
                                                                                    x2="64"
                                                                                    y2="0"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29737"
                                                                                    x1="0"
                                                                                    y1="4.8"
                                                                                    x2="64"
                                                                                    y2="4.8"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29738"
                                                                                    x1="0"
                                                                                    y1="9.6"
                                                                                    x2="64"
                                                                                    y2="9.6"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29739"
                                                                                    x1="0"
                                                                                    y1="14.399999999999999"
                                                                                    x2="64"
                                                                                    y2="14.399999999999999"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29740"
                                                                                    x1="0"
                                                                                    y1="19.2"
                                                                                    x2="64"
                                                                                    y2="19.2"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                                <line
                                                                                    id="SvgjsLine29741"
                                                                                    x1="0"
                                                                                    y1="24"
                                                                                    x2="64"
                                                                                    y2="24"
                                                                                    stroke="#e0e0e0"
                                                                                    stroke-dasharray="0"
                                                                                    stroke-linecap="butt"
                                                                                    class="apexcharts-gridline"
                                                                                ></line>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29734"
                                                                                class="apexcharts-gridlines-vertical"
                                                                                style="display: none;"
                                                                            ></g>
                                                                            <line
                                                                                id="SvgjsLine29743"
                                                                                x1="0"
                                                                                y1="24"
                                                                                x2="64"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                            <line
                                                                                id="SvgjsLine29742"
                                                                                x1="0"
                                                                                y1="1"
                                                                                x2="0"
                                                                                y2="24"
                                                                                stroke="transparent"
                                                                                stroke-dasharray="0"
                                                                                stroke-linecap="butt"
                                                                            ></line>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29727"
                                                                            class="apexcharts-line-series apexcharts-plot-series"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29728"
                                                                                class="apexcharts-series"
                                                                                seriesName="series-1"
                                                                                data:longestSeries="true"
                                                                                rel="1"
                                                                                data:realIndex="0"
                                                                            >
                                                                                <path
                                                                                    id="SvgjsPath29731"
                                                                                    d="M 0 2.8800000000000026 L 7.111111111111111 12.48 L 14.222222222222221 17.28 L 21.333333333333332 10.56 L 28.444444444444443 21.12 L 35.55555555555556 3.84 L 42.666666666666664 16.32 L 49.77777777777778 1.9200000000000017 L 56.888888888888886 6.720000000000002 L 64 10.56"
                                                                                    fill="none"
                                                                                    fill-opacity="1"
                                                                                    stroke="rgba(0,84,166,0.85)"
                                                                                    stroke-opacity="1"
                                                                                    stroke-linecap="round"
                                                                                    stroke-width="2"
                                                                                    stroke-dasharray="0"
                                                                                    class="apexcharts-line"
                                                                                    index="0"
                                                                                    clip-path="url(#gridRectMaskci57eaufi)"
                                                                                    pathTo="M 0 2.8800000000000026 L 7.111111111111111 12.48 L 14.222222222222221 17.28 L 21.333333333333332 10.56 L 28.444444444444443 21.12 L 35.55555555555556 3.84 L 42.666666666666664 16.32 L 49.77777777777778 1.9200000000000017 L 56.888888888888886 6.720000000000002 L 64 10.56"
                                                                                    pathFrom="M -1 24 L -1 24 L 7.111111111111111 24 L 14.222222222222221 24 L 21.333333333333332 24 L 28.444444444444443 24 L 35.55555555555556 24 L 42.666666666666664 24 L 49.77777777777778 24 L 56.888888888888886 24 L 64 24"
                                                                                    fill-rule="evenodd"
                                                                                ></path>
                                                                                <g
                                                                                    id="SvgjsG29729"
                                                                                    class="apexcharts-series-markers-wrap"
                                                                                    data:realIndex="0"
                                                                                ></g>
                                                                            </g>
                                                                            <g
                                                                                id="SvgjsG29730"
                                                                                class="apexcharts-datalabels"
                                                                                data:realIndex="0"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29735"
                                                                            class="apexcharts-grid-borders"
                                                                            style="display: none;"
                                                                        ></g>
                                                                        <line
                                                                            id="SvgjsLine29744"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke="#b6b6b6"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="1"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs"
                                                                        ></line>
                                                                        <line
                                                                            id="SvgjsLine29745"
                                                                            x1="0"
                                                                            y1="0"
                                                                            x2="64"
                                                                            y2="0"
                                                                            stroke-dasharray="0"
                                                                            stroke-width="0"
                                                                            stroke-linecap="butt"
                                                                            class="apexcharts-ycrosshairs-hidden"
                                                                        ></line>
                                                                        <g
                                                                            id="SvgjsG29746"
                                                                            class="apexcharts-xaxis"
                                                                            transform="translate(0, 0)"
                                                                        >
                                                                            <g
                                                                                id="SvgjsG29747"
                                                                                class="apexcharts-xaxis-texts-g"
                                                                                transform="translate(0, 4)"
                                                                            ></g>
                                                                        </g>
                                                                        <g
                                                                            id="SvgjsG29759"
                                                                            class="apexcharts-yaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29760"
                                                                            class="apexcharts-xaxis-annotations"
                                                                        ></g>
                                                                        <g
                                                                            id="SvgjsG29761"
                                                                            class="apexcharts-point-annotations"
                                                                        ></g>
                                                                    </g>
                                                                </svg>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
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
