use crate::utils::{mocks::get_mock_by_id, structs::SearchResultEntry};
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
    let name = move || entry().name.to_string();
    let id = move || entry().id.to_string();
    view! {
        <div class="page-wrapper">
            <div class="page-header d-print-none">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <div class="page-pretitle">
                                Resource overview
                            </div>
                            <h2 class="page-title">
                                Object:
                                {id}
                            </h2>
                        </div>
                        <div class="col-auto ms-auto d-print-none">
                            <div class="btn-list">
                                <span class="d-none d-sm-inline">
                                    <a href="#" class="btn">
                                        New view
                                    </a>
                                </span>
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
                                    Create new report
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
            </div>
        </div>
    }
}
