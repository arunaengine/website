use crate::utils::structs::{VisualizedEndpoint, WhoamiResponse};
use aruna_rust_api::api::storage::models::v2::Endpoint;
use aruna_rust_api::api::storage::services::v2::{GetS3CredentialsUserTokenResponse, CreateS3CredentialsUserTokenResponse};
use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::use_navigate;

#[server]
pub async fn get_proxies() -> Result<Vec<Endpoint>, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    return ConnectionHandler::aruna_get_all_proxies(&token)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e)));
}

#[server]
pub async fn get_credentials(
    endpoint: String,
) -> Result<GetS3CredentialsUserTokenResponse, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    return ConnectionHandler::aruna_get_s3_credentials(&token, &endpoint)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e)));
}

#[server]
pub async fn create_credentials(
    endpoint: String,
) -> Result<CreateS3CredentialsUserTokenResponse, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };

    return ConnectionHandler::aruna_create_s3_credentials(&token, &endpoint)
        .await
        .map_err(|e| ServerFnError::Request(format!("Invalid request: {}", e)));
}

#[component]
pub fn DataProxy(endpoint: VisualizedEndpoint) -> impl IntoView {
    let get_creds = create_server_action::<CreateCredentials>();
    // holds the latest *returned* value from the server
    let value = get_creds.value();

    let result = move || {
        if let Some(Ok(res)) = value().as_ref() {
            Some(res.clone())
        } else {
            None
        }
    };
    let create_args = store_value(CreateCredentials {
        endpoint: endpoint.id.to_string(),
    });

    let get_creds_result_view = move |arg| {
        view! {<CreateCredentialsSuccess create_credentials_response=arg/>}
    };

    view! {

        {move || if let Some(res) = result() {
                get_creds_result_view(res)
            } else {
                ().into_view()
            }
        }

        <div class="card col m-2">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-auto">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">ID</div>
                            <div class="h3 mb-0 w-auto text-primary">{endpoint.id.to_string()}</div>
                        </div>
                    </div>
                </div>
                <div class="row align-items-center">
                    <div class="col-auto">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">URL</div>
                            <div class="h3 mb-0 w-auto text-muted">{endpoint.url.to_string()}</div>
                        </div>
                    </div>
                </div>
                <div class="row align-items-center mt-2">
                    <div class="col-6">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Name</div>
                            <div class="h3 mb-0 w-auto text-muted">{endpoint.name.to_string()}</div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Location</div>
                            <div class="h3 mb-0 w-auto text-muted">{endpoint.location.to_string()}</div>
                        </div>
                    </div>
                </div>
                <div class="row align-items-center mt-2">
                    <div class="col-6">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Type</div>
                            <div class="h3 mb-0 w-auto text-primary">{endpoint.get_type_badge()}</div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Status</div>
                            <div class="h3 mb-0 w-auto text-primary">{endpoint.get_status_badge()}</div>
                        </div>
                    </div>
                </div>
                <div class="row align-items-center mt-2">
                    <div class="col-4">
                        <div class="text-start card-text text-nowrap align-items-center">
                            <div class="text-muted">Stats</div>
                            <div class="h3 mb-0 w-auto text-muted">{endpoint.stats.unwrap_or("N/A".to_string())}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-footer p-0">
                <div class="d-flex">
                    <a href="?create" class="btn btn-primary ms-auto m-1" on:click=move |_| {get_creds.dispatch(create_args())}>
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-plus"
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
                        "Create Credential"
                    </a>
                </div>
            </div>
        </div>
    }
}

#[component]
pub fn DataProxyOverview() -> impl IntoView {
    provide_meta_context();

    let _get_user = use_context::<Resource<(), WhoamiResponse>>().expect("user_state not set");
    let get_endpoints = create_local_resource(
        move || (),
        move |_| async move { get_proxies().await.unwrap_or_default() },
    );

    let _navigate = use_navigate();

    view! {
        <div class="page-header d-print-none my-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <div class="page-pretitle text-start">S3 Interface</div>
                        <h2 class="page-title">Data Proxies</h2>
                    </div>
                </div>
            </div>
        </div>
        <div class="container-xl mt-2 text-start">
            <div class="row">
                <For
                // a function that returns the items we're iterating over; a signal is fine
                each=move || { get_endpoints.get().unwrap_or_default().clone()}
                // a unique key for each item as a reference
                key=|e| e.id.to_string()
                // renders each item to a view
                children=move |ep| {
                    view! {
                        <DataProxy endpoint=ep.into()/>
                    }
                }/>
            </div>
        </div>
    }
}

#[component]
pub fn CreateCredentialsSuccess(
    create_credentials_response: CreateS3CredentialsUserTokenResponse,
) -> impl IntoView {
    provide_meta_context();

    let CreateS3CredentialsUserTokenResponse {
        s3_access_key,
        s3_secret_key,
        ..
    } = create_credentials_response;

    let nav = use_navigate();
    let modal_ref = create_node_ref::<html::Div>();
    modal_ref.on_load(move |loaded| {
        let _ = loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("createCredentialsResult");
            }};
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/dash/proxies", Default::default());
            });

            on_cleanup(move || drop(show_modal));
        });
    });

    view! {
        <div class="modal mt-5 fade" id="createCredentialsResult" _ref=modal_ref tabindex="-1">
            <div class="modal-dialog modal-md modal-dialog-scrollable" role="document">
                <div class="modal-content">
                    <div class="modal-status bg-success"></div>

                    <div class="modal-body">

                        <div class="text-center py-4">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="icon icon-tabler icon-tabler-circle-key text-green mb-2 icon-lg"
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
                                <path d="M14 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"></path>
                                <path d="M21 12a9 9 0 1 1 -18 0a9 9 0 0 1 18 0z"></path>
                                <path d="M12.5 11.5l-4 4l1.5 1.5"></path>
                                <path d="M12 15l-1.5 -1.5"></path>
                            </svg>
                            <h3>"Success! "</h3>
                            <div class="text-muted">"A new token got created!"</div>
                        </div>
                        <div class="text-start">
                            <div class="list-group m-0">
                                <label class="form-label">"AccessKey"</label>
                                // on:click=move |_| to_clipboard(&id)>
                                <li class="list-group-item list-group-item-action text-break">
                                    {s3_access_key}
                                </li>
                                <label class="form-label">"SecretKey"</label>
                                // on:click=move |_| to_clipboard(&token_secret)>
                                <li class="list-group-item list-group-item-action text-break">
                                    {s3_secret_key}
                                </li>
                            </div>
                        </div>

                    </div>

                    <div class="modal-footer">
                        <a
                            href="/dash/proxies"
                            class="btn"
                            data-bs-dismiss="modal"
                            data-bs-target="#createCredentialsResult"
                        >
                            "Close"
                        </a>
                    </div>
                </div>
            </div>
        </div>
    }
}
