use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn Search() -> impl IntoView {
    view! {
        <div class="text-left">
            <div class="page-header d-print-none row">
                <div class="container-xl mt-2 col-3">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">"Search results"</h2>
                            <div class="text-secondary mt-1 text-left">
                                "About 2,410 result (0.19 seconds)"
                            </div>
                        </div>
                    </div>
                </div>
                <div class="container-xl mt-4 col">
                    <div class="mb-3 input-group text-center">
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
                            Resources
                        </span>
                        <button
                            class="btn btn-outline-secondary dropdown-toggle"
                            type="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            All
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end">
                            <li>
                                <a class="dropdown-item" href="#">
                                    Projects
                                </a>
                            </li>
                            <li>
                                <a class="dropdown-item" href="#">
                                    Collections
                                </a>
                            </li>
                            <li>
                                <a class="dropdown-item" href="#">
                                    Datasets
                                </a>
                            </li>
                            <li>
                                <a class="dropdown-item" href="#">
                                    Objects
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="page-body">
                <div class="container-xl">
                    <div class="row">
                        <div class="col-3">
                            <form action="./" method="get" autocomplete="off" novalidate="">
                                <div class="subheader mb-2">"Resource"</div>
                                <div class="list-group list-group-transparent mb-3">
                                    <a
                                        class="list-group-item list-group-item-action d-flex align-items-center active"
                                        href="#"
                                    >
                                        "All"
                                        <small class="text-secondary ms-auto">"24"</small>
                                    </a>
                                    <a
                                        class="list-group-item list-group-item-action d-flex align-items-center"
                                        href="#"
                                    >
                                        "Projects"
                                        <small class="text-secondary ms-auto">"149"</small>
                                    </a>
                                    <a
                                        class="list-group-item list-group-item-action d-flex align-items-center"
                                        href="#"
                                    >
                                        "Collections"
                                        <small class="text-secondary ms-auto">"88"</small>
                                    </a>
                                    <a
                                        class="list-group-item list-group-item-action d-flex align-items-center"
                                        href="#"
                                    >
                                        "Datasets"
                                        <small class="text-secondary ms-auto">"54"</small>
                                    </a>
                                    <a
                                        class="list-group-item list-group-item-action d-flex align-items-center"
                                        href="#"
                                    >
                                        "Objects"
                                        <small class="text-secondary ms-auto">"54"</small>
                                    </a>
                                </div>
                            </form>
                        </div>
                        <div class="col m-2">
                            <div class="card">
                                <div class="card-body">
                                    <h3 class="card-title">
                                        Object 1
                                    </h3>
                                    <p class="text-secondary">
                                        "This is a description of an object text within a card body."
                                    </p>
                                </div>
                            </div>
                            <div class="card">
                                <div class="card-body">
                                    <h3 class="card-title">
                                        Object 2
                                    </h3>
                                    <p class="text-secondary">
                                        "This is a description of an object text within a card body."
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    }
}
