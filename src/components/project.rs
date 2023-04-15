use leptos::*;
use leptos_meta::*;
use crate::utils::structs::SimplePermission;

/// Renders the home page of your application.
#[component]
pub fn Project(cx: Scope, project: SimplePermission) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,
        <tr>
            <td>{project.project_id.clone()}</td>
            <td>"-"</td>
            <td>{project.permission}</td>
            <td>
                <div class="d-flex justify-content-end">
                    <a href="#" class="btn btn btn-icon mx-2 btn-sm my-accordion-icon" role="button" aria-label="Button" data-bs-toggle="collapse" data-bs-target=format!(r##"#S{}"##, project.project_id.clone()) aria-expanded="false">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-arrow-down" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 5l0 14"></path>
                            <path d="M18 13l-6 6"></path>
                            <path d="M6 13l6 6"></path>
                        </svg>
                    </a>
                    <a href="#" class="btn btn-danger btn-icon btn-sm" aria-label="Button" role="button" >//on:click=move |_| {set_deleting.set(token_id.get_value())}>
                    <Suspense fallback=move || view! { cx, <div class="spinner-border"></div> }>
                        {move || {
                            view!{cx, 
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-trash" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M4 7l16 0"></path>
                                    <path d="M10 11l0 6"></path>
                                    <path d="M14 11l0 6"></path>
                                    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path>
                                    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path>
                                </svg>
                            }
                        }}
                        </Suspense>
                    </a>
                </div>
            </td>
        </tr>
        <tr class="accordion-collapse collapse" id=format!("S{}", project.project_id.clone()) data-bs-parent="#tokenTable">
            <td colspan="4">
                <div class="card card-borderless">
                    <div class="card-body accordion-body">
                        <div class="datagrid">
                            <div class="datagrid-item">
                                <div class="datagrid-title">"ID"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Name"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Type"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Target"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Permission level"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Created at"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Expires at"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Last used"</div>
                                <div class="datagrid-content">"Temp"</div>
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    }
}