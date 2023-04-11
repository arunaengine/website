use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn Token(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,
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
    }
}
