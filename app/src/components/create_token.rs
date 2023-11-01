use anyhow::Result;
use aruna_rust_api::api::storage::services::v2::CreateApiTokenResponse;
use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::{
    modal::hide_modal,
    structs::{UpdateTokens},
};

#[server]
pub async fn create_token_server(
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: Option<String>,
    selectexpiry: String,
    customdate: Option<String>,
) -> Result<CreateApiTokenResponse, ServerFnError> {
    use crate::utils::aruna_api_handlers::aruna_create_token;
    use crate::utils::aruna_api_helpers::to_create_token_req;
    use axum_extra::extract::CookieJar;

    let req_parts = use_context::<leptos_axum::RequestParts>()
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;
    let jar = CookieJar::from_headers(&req_parts.headers);

    let token = if let Some(cookie) = jar.get("token") {
        cookie.value().to_string()
    } else {
        "".to_string()
    };
    aruna_create_token(
        to_create_token_req(
            tokenname,
            selecttype,
            resid,
            selectperm,
            selectexpiry,
            customdate,
        ).map_err(|_| ServerFnError::Request("Invalid request (aruna_get_token)".to_string()))?,
        &token,
    )
    .await
    .map_err(|_| ServerFnError::Request("Invalid request (aruna_get_token)".to_string()))?
    .try_into()
    .map_err(|_| ServerFnError::Request("Invalid request (aruna_get_token)".to_string()))
}

#[component]
pub fn CreateTokenSuccess(create_token_resp: CreateApiTokenResponse) -> impl IntoView {
    provide_meta_context();

    let update_tokens = use_context::<UpdateTokens>().expect("user_state not set");
    update_tokens.0.update(|e| *e = !*e);

    let CreateApiTokenResponse {
        token,
        token_secret,
    } = create_token_resp;

    let token = token.unwrap_or_default();

    let nav = use_navigate();
    let modal_ref = create_node_ref::<html::Div>();
    modal_ref.on_load(move |loaded| {
        let _ = loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("createTokenResult");
            }};
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/dash/tokens", Default::default());
            });

            on_cleanup(move || drop(show_modal));
        });
    });

    let id_clone = token.id.clone();
    let name_clone = token.name.clone();
    let token_secret_clone = token_secret.clone();

    //let to_clipboard = move |cp: &str| _ = window().navigator().to_clipboard().unwrap().write_text(cp);

    view! {
        <div class="modal mt-5 fade" id="createTokenResult" _ref=modal_ref tabindex="-1">
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
                                <label class="form-label">"ID"</label>
                                // on:click=move |_| to_clipboard(&id)>
                                <li class="list-group-item list-group-item-action text-break">
                                    {id_clone}
                                </li>
                                <label class="form-label">"Name"</label>
                                // on:click=move |_| to_clipboard(&name)>
                                <li class="list-group-item list-group-item-action text-break">
                                    {name_clone}
                                </li>
                                <label class="form-label">"Token secret"</label>
                                // on:click=move |_| to_clipboard(&token_secret)>
                                <li class="list-group-item list-group-item-action text-break">
                                    {token_secret_clone}
                                </li>
                            </div>
                        </div>

                    </div>

                    <div class="modal-footer">
                        <a
                            href="/"
                            class="btn"
                            data-bs-dismiss="modal"
                            data-bs-target="#createToken"
                        >
                            "Close"
                        </a>
                    </div>
                </div>
            </div>
        </div>
    }
}

#[component]
pub fn CreateToken(
    create_token_action: Action<CreateTokenServer, Result<CreateApiTokenResponse, ServerFnError>>,
) -> impl IntoView {
    provide_meta_context();
    let nav = use_navigate();
    //let loc = use_location();
    let modal_ref = create_node_ref::<html::Div>();
    modal_ref.on_load(move |loaded| {
        let _ = loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("createToken");
            }};
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/dash/tokens", Default::default());
            });

            on_cleanup(move || drop(show_modal));
        });
    });

    //let query_map = loc.query;
    //let contains_success = move || query_map().get("success").is_some();

    let token_type = create_node_ref::<html::Select>();
    let expiry = create_node_ref::<html::Select>();
    let form = create_node_ref::<html::Form>();

    let (needs_id, write_needs_id) = create_signal(false);
    let (needs_custom_date, write_custom_date) = create_signal(false);
    let needs_val = create_rw_signal(false);

    view! {
        <div class="modal mt-5 fade" id="createToken" _ref=modal_ref tabindex="-1">
            <div class="modal-dialog modal-sm" role="document">
                <div class="modal-content">
                    <form
                        on:submit=move |ev| {
                            ev.prevent_default();
                            let data = CreateTokenServer::from_event(&ev)
                                .expect("to parse form data");
                            needs_val.update(|nval| *nval = !*nval);
                            if !form.get().unwrap().check_validity() {
                                return;
                            }
                            _ = &create_token_action.dispatch(data);
                            hide_modal("createToken");
                        }

                        class="needs-validation"
                        class:was-validated=needs_val
                        novalidate
                        _ref=form
                    >
                        <div class="modal-status bg-info"></div>

                        <div class="modal-body">

                            <div class="text-center py-4">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-api-app mb-2 text-blue icon-lg"
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
                                    <path d="M12 15h-6.5a2.5 2.5 0 1 1 0 -5h.5"></path>
                                    <path d="M15 12v6.5a2.5 2.5 0 1 1 -5 0v-.5"></path>
                                    <path d="M12 9h6.5a2.5 2.5 0 1 1 0 5h-.5"></path>
                                    <path d="M9 12v-6.5a2.5 2.5 0 0 1 5 0v.5"></path>
                                </svg>
                                <h3>"Create new token!"</h3>
                            </div>

                            <div class="form-floating mb-3">
                                <input
                                    type="text"
                                    class="form-control"
                                    id="tokenname"
                                    name="tokenname"
                                    placeholder="Your token name"
                                />
                                <label for="tokenname">"Token name"</label>
                            </div>
                            <div class="form-floating mb-3">
                                <select
                                    class="form-select"
                                    id="selecttype"
                                    name="selecttype"
                                    aria-label="Token type"
                                    _ref=token_type
                                    on:input=move |_| {
                                        let needs_update = match token_type() {
                                            Some(t) => t.value() != "0",
                                            None => false,
                                        };
                                        write_needs_id(needs_update);
                                    }
                                >

                                    <option value="personal" selected>
                                        "Personal"
                                    </option>
                                    <option value="project">"Project"</option>
                                    <option value="collection">"Collection"</option>
                                    <option value="dataset">"Dataset"</option>
                                    <option value="object">"Object"</option>
                                </select>
                                <label for="selecttype">"Select a tokentype"</label>
                            </div>
                            {move || {
                                if needs_id() {
                                    view! {
                                        <div class="form-floating mb-3">
                                            <input
                                                type="text"
                                                class="form-control text-lowercase"
                                                pattern={"^[0-7][0-9A-HJKMNP-TV-Z]{25}$"}
                                                id="resid"
                                                name="resid"
                                                placeholder="Resource ID"
                                                required
                                            />
                                            <label for="resid">"ULID"</label>
                                            <div class="invalid-feedback">
                                                "Invalid ULID expected format: '01BX5ZZKBKACTAV9WEVGEMMVRY'"
                                            </div>
                                        </div>
                                        <div class="form-floating mb-3">
                                            <select
                                                class="form-select"
                                                id="selectperm"
                                                name="selectperm"
                                                aria-label="Token permissions"
                                                required
                                            >
                                                <option value="NONE" selected>
                                                    "NONE"
                                                </option>
                                                <option value="READ">"READ"</option>
                                                <option value="APPEND">"APPEND"</option>
                                                <option value="MODIFY">"MODIFY"</option>
                                                <option value="ADMIN">"ADMIN"</option>
                                            </select>
                                            <label for="selectperm">"Token permissions"</label>
                                        </div>
                                    }
                                        .into_view()
                                } else {
                                    ().into_view()
                                }
                            }}

                            <div class="form-floating mb-3">
                                <select
                                    class="form-select"
                                    id="selectexpiry"
                                    name="selectexpiry"
                                    aria-label="Token expiry"
                                    _ref=expiry
                                    on:input=move |_| {
                                        let needs_date = match expiry() {
                                            Some(t) => t.value() == "5",
                                            None => false,
                                        };
                                        write_custom_date(needs_date);
                                    }
                                >

                                    <option value="0" selected>
                                        "Never"
                                    </option>
                                    <option value="1">"1 Day"</option>
                                    <option value="2">"7 Days"</option>
                                    <option value="3">"30 Days"</option>
                                    <option value="4">"365 Days"</option>
                                    <option value="5">"Custom"</option>
                                </select>
                                <label for="selectexpiry">"Token expiry time"</label>
                            </div>
                            {move || {
                                if needs_custom_date() {
                                    view! {
                                        <div class="form-floating mb-3">
                                            <input
                                                type="date"
                                                class="form-control"
                                                id="customdate"
                                                name="customdate"
                                                required
                                            />
                                            <label for="customdate">"Choose a custom date"</label>
                                            <div class="invalid-feedback">
                                                "Required date for custom expiry"
                                            </div>
                                        </div>
                                    }
                                        .into_view()
                                } else {
                                    ().into_view()
                                }
                            }}

                        </div>

                        <div class="modal-footer">
                            <a
                                href="/"
                                class="btn"
                                data-bs-dismiss="modal"
                                data-bs-target="#createToken"
                            >
                                "Cancel"
                            </a>
                            <button type="submit" class="btn btn-primary ms-auto">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="icon icon-tabler icon-tabler-plus"
                                    width="24"
                                    height="24"
                                    viewBox="0 0 24 24"
                                    stroke-width="1"
                                    stroke="currentColor"
                                    fill="none"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                    <path d="M12 5l0 14"></path>
                                    <path d="M5 12l14 0"></path>
                                </svg>
                                "Create"
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    }
}
