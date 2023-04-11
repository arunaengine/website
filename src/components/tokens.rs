use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[component]
pub fn TokensOverview(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,
        <div class="page-header d-print-none my-3">
            <div class="container-xl">
            <div class="row g-2 align-items-center">
                <div class="col">
                <h2 class="page-title">
                    "Tokens"
                </h2>
                </div>
            </div>
            </div>
        </div>
        <div class="container-xl mt-2 text-start">
            <div class="card">
                <div class="table-responsive">
                    <table class="table table-vcenter card-table accordion" id="tokenTable">
                        <thead>
                        <tr>
                            <th>"Id"</th>
                            <th>"Name"</th>
                            <th>"Last used"</th>
                            <th class="w-3 text-center">"Actions"</th>
                        </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>"39ece7b1-5310-4061-a2f5-c1592051e05d"</td>
                                <td>"My Personal Token"</td>
                                <td>"02/04/2017 12:50"</td>
                                <td>
                                    <div class="d-flex">
                                        <a href="#" class="btn btn btn-icon mx-2 btn-sm my-accordion-icon" aria-label="Button" data-bs-toggle="collapse" data-bs-target="#r1" aria-expanded="false">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-down" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M12 5l0 14"></path>
                                                <path d="M18 13l-6 6"></path>
                                                <path d="M6 13l6 6"></path>
                                            </svg>
                                        </a>
                                        <a href="#" class="btn btn-danger btn-icon btn-sm" aria-label="Button">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M4 7l16 0"></path>
                                                <path d="M10 11l0 6"></path>
                                                <path d="M14 11l0 6"></path>
                                                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path>
                                                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path>
                                            </svg>
                                        </a>
                                    </div>
                                </td>
                            </tr>
                            <tr class="accordion-collapse collapse" id="r1" data-bs-parent="#tokenTable">
                                <td colspan="4">
                                    <div class="card card-borderless">
                                        <div class="card-body accordion-body">
                                            <div class="datagrid">
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"ID"</div>
                                                    <div class="datagrid-content">"39ece7b1-5310-4061-a2f5-c1592051e05d"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Name"</div>
                                                    <div class="datagrid-content">"My Personal Token"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Type"</div>
                                                    <div class="datagrid-content">"Personal"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Target"</div>
                                                    <div class="datagrid-content">"-"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Permission level"</div>
                                                    <div class="datagrid-content">"READ"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Created at"</div>
                                                    <div class="datagrid-content">"02/04/2017 12:50"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Expires at"</div>
                                                    <div class="datagrid-content">"02/04/2100 12:50"</div>
                                                </div>
                                                <div class="datagrid-item">
                                                    <div class="datagrid-title">"Last used"</div>
                                                    <div class="datagrid-content">"02/04/2100 12:50"</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="card-footer p-0">
                    <div class="d-flex">
                        <A href="#" class="btn btn-primary ms-auto m-1">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M12 5l0 14"></path>
                                <path d="M5 12l14 0"></path>
                            </svg>
                            "Create Token"
                        </A>
                    </div>
                </div>
            </div>
        </div>
    <div class="page-header d-print-none my-2">
        <div class="container-xl">
            <div class="row g-2 align-items-center">
                <div class="col">
                    <h2 class="page-title">
                        "Sessions"
                    </h2>
                </div>
            </div>
        </div>
    </div>
    <div class="container-xl mt-2 text-start">
        <div class="card">
            <div class="table-responsive">
                <table class="table table-vcenter card-table">
                    <thead>
                    <tr>
                        <th>"Id"</th>
                        <th>"Expires"</th>
                        <th>"Last used"</th>
                        <th class="w-1">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td colspan="4" class="text-center">"Looks like you currently have no active sessions!"</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
        }
}
