use crate::components::create_project::*;
use crate::components::project::*;
use crate::components::project_admin::*;
use crate::utils::structs::ProjectOverviewWeb;
use crate::utils::structs::UserState;
use leptos::*;
use leptos_meta::*;

#[server(AdminAllProjects, "/web")]
pub async fn admin_all_projects() -> Result<Vec<ProjectOverviewWeb>, ServerFnError> {
    Ok(Vec::new())
    // use crate::utils::aruna_api_handlers::aruna_get_all_projects;

    // use actix_session::SessionExt;
    // use actix_web::HttpRequest;
    // let req = use_context::<HttpRequest>().unwrap();

    // let sess = req.get_session();

    // let token = sess
    //     .get::<String>("token")
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
    //     .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;

    // Ok(aruna_get_all_projects(&token)
    //     .await
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
    //     .projects
    //     .into_iter()
    //     .map(|pov| pov.into())
    //     .collect::<Vec<_>>())
}

#[component]
pub fn ProjectsOverview() -> impl IntoView {
    provide_meta_context();

    let get_user = use_context::<Resource<bool, Option<UserState>>>().expect("user_state not set");

    let permissions = create_memo(move |_| {
        get_user
            .get()
            .unwrap_or_default()
            .unwrap_or_default()
            .permissions
    });

    let is_admin = create_memo(move |_| {
        get_user
            .get()
            .unwrap_or_default()
            .unwrap_or_default()
            .is_admin
    });

    let admin_project_value = create_rw_signal(0);
    let admin_get_proj_action = create_server_action::<AdminAllProjects>();

    let admin_user = create_memo(move |_| {
        admin_get_proj_action
            .value()
            .get()
            .unwrap_or(Ok(Vec::new()))
            .unwrap_or_default()
    });

    provide_context(admin_get_proj_action);

    create_effect(
        move |_| {
            if admin_project_value() < admin_get_proj_action.version()() {}
        },
    );

    view! {
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
                        <Transition fallback=move || view! { , <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                        {
                            move || if !permissions().is_empty() {
                                permissions().into_iter()
                                .map(|item| view! {
                                    <Project project=item/>
                                })
                                .collect::<Vec<_>>().into_view()
                            }else{
                                view!{<tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view()
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
            admin_get_proj_action.dispatch(AdminAllProjects {});
            view!{
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
                                <Transition fallback=move || view! { , <tr><td colspan="4" class="text-center"><div class="spinner-border"></div></td></tr> }>
                                {
                                    move ||

                                    if !admin_user().is_empty() {
                                        admin_user().into_iter()
                                        .map(|item| view! {
                                            <ProjectAdmin project=item/>
                                        })
                                        .collect::<Vec<_>>().into_view()
                                    }else{
                                        view!{<tr><td colspan="4" class="text-center">"Looks like you are currently not associated with any project!"</td></tr>}.into_view()
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
            }.into_view()

        }else{
            ().into_view()
        }

    }}
    }
}
