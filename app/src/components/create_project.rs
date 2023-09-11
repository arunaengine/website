use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[server(CreateProjectRequest, "/web")]
pub async fn creat_project_req(_name: String, _description: String) -> Result<(), ServerFnError> {
    // use crate::utils::aruna_api_handlers::aruna_create_project;
    // use actix_session::SessionExt;
    // use actix_web::HttpRequest;
    // let req = use_context::<HttpRequest>().unwrap();

    // let sess = req.get_session();

    // let token = sess
    //     .get::<String>("token")
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
    //     .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;

    // let _resp = aruna_create_project(&token, &name, &description)
    //     .await
    //     .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?;

    Ok(())
}

/// Renders the home page of your application.
#[component]
pub fn CreateProject() -> impl IntoView {
    provide_meta_context();

    let create_project_action = create_server_action::<CreateProjectRequest>();

    view! {
        <div class="modal" id="createProject" tabindex="-1">
            <div class="modal-dialog modal-sm" role="document">
                <div class="modal-content">
                    <ActionForm
                        on:submit=move |ev| {
                            let _data = CreateProjectRequest::from_event(&ev)
                                .expect("to parse form data");
                        }

                        action=create_project_action
                    >
                        <button
                            type="button"
                            class="btn-close"
                            data-bs-dismiss="modal"
                            aria-label="Close"
                        ></button>
                        <div class="modal-status bg-success"></div>
                        <div class="modal-body text-center py-4">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-book-upload icon-lg text-success"
                                width="40"
                                height="40"
                                viewBox="0 0 24 24"
                                stroke-width="1"
                                stroke="currentColor"
                                fill="none"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                <path d="M14 20h-8a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12v5"></path>
                                <path d="M11 16h-5a2 2 0 0 0 -2 2"></path>
                                <path d="M15 16l3 -3l3 3"></path>
                                <path d="M18 13v9"></path>
                            </svg>
                            <h3>{"Create project"}</h3>
                            <div class="form-floating mb-3">
                                <input
                                    type="text"
                                    class="form-control text-lowercase"
                                    id="name"
                                    name="name"
                                    placeholder="Project Name"
                                    required
                                />
                                <label for="projid">"Project Name"</label>
                            </div>
                            <div class="form-floating mb-3">
                                <textarea
                                    type="text"
                                    class="form-control text-lowercase"
                                    id="description"
                                    name="description"
                                    placeholder="Project Description"
                                    required
                                ></textarea>
                                <label for="description">"Project Description"</label>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <div class="w-100">
                                <div class="row">
                                    <div class="col">
                                        <a href="#" class="btn w-100" data-bs-dismiss="modal">
                                            "Cancel"
                                        </a>
                                    </div>
                                    <div class="col">
                                        <button
                                            type="submit"
                                            class="btn btn-success w-100"
                                            data-bs-dismiss="modal"
                                        >
                                            "Create"
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ActionForm>
                </div>
            </div>
        </div>
    }
}
