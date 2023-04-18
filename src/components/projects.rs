use leptos::*;
use leptos_meta::*;
use crate::utils::structs::UserState;
use crate::components::project::*;
use crate::components::create_project::*;


#[component]
pub fn ProjectsOverview(cx: Scope) -> impl IntoView {

    provide_meta_context(cx);

    let get_user =
    use_context::<Resource<bool, Option<UserState>>>(cx).expect("user_state not set");

    let permissions = create_memo(cx, move |_| {
        get_user.read(cx).unwrap_or_default().unwrap_or_default().permissions
    });

    let is_admin = create_memo(cx, move |_| {
        get_user.read(cx).unwrap_or_default().unwrap_or_default().is_admin
    });

    view! {cx,
    <div class="page-header d-print-none my-3">
        <div class="container-xl">
        <div class="row g-2 align-items-center">
            <div class="col">
            <h2 class="page-title">
                "Personal Projects"
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
                        <th>"Name"</th>
                        <th>"Role"</th>
                        <th class="w-1">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        <Transition fallback=move || view! { cx, <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                        {
                            move || if !permissions().is_empty() {
                                permissions().into_iter()
                                .map(|item| view! {
                                    cx,
                                    <Project project=item from_admin=false/>
                                })
                                .collect::<Vec<_>>().into_view(cx) 
                            }else{
                                view!{cx, <tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view(cx)
                            }
                        }
                        </Transition>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    {move || {
        if is_admin.get() {

            view!{cx,

                <CreateProject />
                <div class="page-header d-print-none my-3">
                <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                    <h2 class="page-title">
                        "All Projects"
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
                                <th>"Name"</th>
                                <th>""</th>
                                <th class="w-1">"Actions"</th>
                            </tr>
                            </thead>
                            <tbody>
                                <Transition fallback=move || view! { cx, <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                                {
                                    move || if !permissions().is_empty() {
                                        permissions().into_iter()
                                        .map(|item| view! {
                                            cx,
                                            <Project project=item from_admin=true/>
                                        })
                                        .collect::<Vec<_>>().into_view(cx) 
                                    }else{
                                        view!{cx, <tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view(cx)
                                    }
                                }
                                </Transition>
                            </tbody>
                        </table>
                    </div>
                    <div class="card-footer p-0">
                    <div class="d-flex">
                        <button class="btn btn-primary ms-auto m-1" type="button" data-bs-toggle="modal" data-bs-target="#createProject">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M12 5l0 14"></path>
                                <path d="M5 12l14 0"></path>
                            </svg>
                            "Create Project"
                        </button>
                    </div>
                </div>
                </div>
            </div>
            
            
            }.into_view(cx)

        }else{
            ().into_view(cx)
        }

    }}
    }
}
