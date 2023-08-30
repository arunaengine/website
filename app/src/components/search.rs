use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn Search() -> impl IntoView {
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
                <div class="row mt-4">
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
                    <div class="col-9 ps-3">
                        <div class="card mt-2">
                            <div class="card-status-start bg-green"></div>
                            <div class="card-body d-flex container flex-column">
                                <div class="ribbon">
                                    Object
                                </div>
                                <div class="row">
                                    <div class="col-4">
                                        <div>
                                            <h3 class="text-primary">"SRE-20001-22000"</h3>
                                            <h4 class="subheader">"01H93FNJEPN2DQFP2G8MBTK2XD"</h4>
                                        </div>
                                        <span class="status status-green m-1">
                                            Public
                                        </span>
                                        <span class="status status-yellow m-1">
                                            Count: 1
                                        </span>
                                        <span class="status status-cyan m-1">
                                            1.2 GB
                                        </span>
                                    </div>
                                    <div class="col border-start me-4">
                                        <div class="pb-2 mb-2 border-bottom">
                                            <span class="status status-cyan m-1">
                                                experiment | Plasmidhunter
                                            </span>
                                            <span class="status status-cyan m-1">
                                                project | SRE-20001
                                            </span>
                                            <span class="status status-cyan m-1">
                                                validated | TRUE
                                            </span>
                                        </div>
                                        <div class="row">
                                            <h4 class="subheader mb-0">"Description"</h4>
                                            <p class="text-secondary mb-0">
                                            "A metagenomic dataset from somewhere!"
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card mt-2">
                        <div class="card-status-start bg-green"></div>
                        <div class="card-body d-flex container flex-column">
                            <div class="ribbon">
                                Object
                            </div>
                            <div class="row">
                                <div class="col-4">
                                    <div>
                                        <h3 class="text-primary">"SRE-123123-1231231231"</h3>
                                        <h4 class="subheader">"01H93HDRV1ZAJH8AT880CH8C0R"</h4>
                                    </div>
                                    <span class="status status-green m-1">
                                        Public
                                    </span>
                                    <span class="status status-yellow m-1">
                                        Count: 1
                                    </span>
                                    <span class="status status-cyan m-1">
                                        3.4 MB
                                    </span>
                                </div>
                                <div class="col border-start me-4">
                                    <div class="pb-2 mb-2 border-bottom">
                                        <span class="status status-cyan m-1">
                                            experiment | Plasmidhunter
                                        </span>
                                        <span class="status status-cyan m-1">
                                            project | SRE-123123123
                                        </span>
                                        <span class="status status-cyan m-1">
                                            validated | FALSE
                                        </span>
                                    </div>
                                    <div class="row">
                                        <h4 class="subheader mb-0">"Description"</h4>
                                        <p class="text-secondary mb-0">
                                        "A metagenomic dataset from somewhere!"
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card mt-2">
                        <div class="card-status-start bg-orange"></div>
                        <div class="card-body d-flex container flex-column">
                            <div class="ribbon bg-red">
                                Project
                            </div>
                            <div class="row">
                                <div class="col-4">
                                    <div>
                                        <h3 class="text-primary">"Biodiv-demo-project"</h3>
                                        <h4 class="subheader">"01H93HDRV1ZAJH8AT880CH8C0R"</h4>
                                    </div>
                                    <span class="status status-orange m-1">
                                        Private
                                    </span>
                                    <span class="status status-yellow m-1">
                                        Count: 11231
                                    </span>
                                    <span class="status status-cyan m-1">
                                        - MB
                                    </span>
                                </div>
                                <div class="col border-start me-4">
                                    <div class="pb-2 mb-2 border-bottom">
                                        <span class="status status-cyan m-1">
                                            experiment | Fischsuppe
                                        </span>
                                        <span class="status status-cyan m-1">
                                            project | SRE-123123
                                        </span>
                                        <span class="status status-cyan m-1">
                                            validated | FALSE
                                        </span>
                                    </div>
                                    <div class="row">
                                        <h4 class="subheader mb-0">"Description"</h4>
                                        <p class="text-secondary mb-0">
                                        "A biodiversic biodiversity experiment from somewhere!"
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card mt-2">
                        <div class="card-status-start bg-orange"></div>
                        <div class="card-body d-flex container flex-column">
                            <div class="ribbon bg-cyan">
                                Dataset
                            </div>
                            <div class="row">
                                <div class="col-4">
                                    <div>
                                        <h3 class="text-primary">"Oma ernas krebsdaten"</h3>
                                        <h4 class="subheader">"01H93HRFXEVZT8B5QDC43YV9G2"</h4>
                                    </div>
                                    <span class="status status-orange m-1">
                                        Private
                                    </span>
                                    <span class="status status-yellow m-1">
                                        Count: 2
                                    </span>
                                    <span class="status status-cyan m-1">
                                        2.6 GB
                                    </span>
                                </div>
                                <div class="col border-start me-4">
                                    <div class="pb-2 mb-2 border-bottom">
                                        <span class="status status-cyan m-1">
                                            experiment | Oma erna
                                        </span>
                                        <span class="status status-cyan m-1">
                                            project | OE
                                        </span>
                                        <span class="status status-cyan m-1">
                                            validated | FALSE
                                        </span>
                                    </div>
                                    <div class="row">
                                        <h4 class="subheader mb-0">"Description"</h4>
                                        <p class="text-secondary mb-0">
                                        "Security through obscurity!"
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                        <div class="card mt-2">
                            <div class="card-status-start bg-orange"></div>
                            <div class="card-body">
                                <div class="ribbon bg-red">
                                    Project
                                </div>
                                <div class="row d-flex">
                                    <div class="col-4">
                                        <div>
                                            <h3 class="text-primary">"Biodiv-demo-project"</h3>
                                            <div class="subheader">"01H93FP6RHJCAWW5ZZNWK1TXWG"</div>
                                        </div>
                                        <p class="text-secondary">
                                            "Demonstrator project for something with biodiversity"
                                        </p>
                                        <span class="status status-orange m-1">
                                            Private
                                        </span>
                                        <span class="status status-yellow m-1">
                                            Objects: 10233
                                        </span>
                                        <span class="status status-cyan m-1">
                                            - GB
                                        </span>
                                    </div>
                                    <div class="col border-start d-flex">
                                        <span class="status status-cyan m-1">
                                            experiment | Plasmidhunter
                                        </span>
                                        <span class="status status-cyan m-1">
                                            project | SRE-20001
                                        </span>
                                        <span class="status status-cyan m-1">
                                            validated | TRUE
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }
}
