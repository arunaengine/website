use anyhow::Result;
use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::{modal::hide_modal, structs::TokenResponse};

#[server(CreateTokenServer, "/web")]
pub async fn create_token_server(
    #[allow(unused_variables)] cx: Scope,
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: Option<String>,
    selectexpiry: String,
    customdate: Option<String>,
) -> Result<TokenResponse, ServerFnError> {
    use crate::utils::aruna_api_handlers::aruna_create_token;
    use crate::utils::aruna_api_helpers::to_create_token_req;
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx).unwrap();

    let sess = req.get_session();

    let token = sess
        .get::<String>("token")
        .map_err(|_| ServerFnError::Request("Invalid request".to_string()))?
        .ok_or_else(|| ServerFnError::Request("Invalid request".to_string()))?;

    aruna_create_token(
        to_create_token_req(
            tokenname,
            selecttype,
            resid,
            selectperm,
            selectexpiry,
            customdate,
        ),
        &token,
    )
    .await
    .map_err(|_| ServerFnError::Request("Invalid request (aruna_get_token)".to_string()))?
    .try_into()
    .map_err(|_| ServerFnError::Request("Invalid request (aruna_get_token)".to_string()))
}

#[component]
pub fn CreateTokenSuccess(cx: Scope, create_token_resp: TokenResponse) -> impl IntoView {
    provide_meta_context(cx);

    let TokenResponse {
        id,
        name,
        token_secret,
        access_key,
        secret_key,
    } = create_token_resp;

    let nav = use_navigate(cx);
    let modal_ref = create_node_ref::<html::Div>(cx);
    modal_ref.on_load(cx, move |loaded| {
        loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("createTokenResult");
            }};
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/panel/tokens", Default::default()).unwrap();
            });

            on_cleanup(cx, move || drop(show_modal));
        });
    });

    let id_clone = id.clone();
    let name_clone = name.clone();
    let token_secret_clone = token_secret.clone();
    let access_key_clone = access_key.clone();
    let secret_key_clone = secret_key.clone();

    let to_clipboard = move |cp: &str| _ = window().navigator().clipboard().unwrap().write_text(cp);

    view! {cx,
        <div class="modal mt-5 fade" id="createTokenResult" _ref=modal_ref tabindex="-1">
        <div class="modal-dialog modal-md" role="document">
            <div class="modal-content">
                <div class="modal-status bg-success"></div>

                <div class="modal-body">

                    <div class="text-center py-4">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-circle-key text-green mb-2 icon-lg" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
                            <li class="list-group-item list-group-item-action text-break" on:click=move |_| to_clipboard(&id)>
                                {id_clone}
                            </li>
                            <label class="form-label">"Name"</label>
                            <li class="list-group-item list-group-item-action text-break" on:click=move |_| to_clipboard(&name)>
                                {name_clone}
                            </li>
                            <label class="form-label">"S3 Access Key"</label>
                            <li class="list-group-item list-group-item-action text-break" on:click=move |_| to_clipboard(&access_key)>
                                {access_key_clone}
                            </li>
                            <div class="alert alert-warning mt-3" role="alert">
                                <h4 class="alert-title">"Make sure to copy (click) your secrets below!"</h4>
                                <div class="text-muted">"These secrets can not be recreated, if lost, a new token must be generated!"</div>
                            </div>
                            <label class="form-label">"S3 Secret Key"</label>
                            <li class="list-group-item list-group-item-action text-break" on:click=move |_| to_clipboard(&secret_key)>
                                {secret_key_clone}
                            </li>
                            <label class="form-label">"Secret"</label>
                            <li class="list-group-item list-group-item-action text-break" on:click=move |_| to_clipboard(&token_secret)>
                                {token_secret_clone}
                            </li>
                        </div>
                    </div>

                </div>

                <div class="modal-footer">
                    <a href="/" class="btn" data-bs-dismiss="modal" data-bs-target="#createToken">
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
    cx: Scope,
    create_token_action: Action<CreateTokenServer, Result<TokenResponse, ServerFnError>>,
) -> impl IntoView {
    provide_meta_context(cx);
    let nav = use_navigate(cx);
    //let loc = use_location(cx);
    let modal_ref = create_node_ref::<html::Div>(cx);
    modal_ref.on_load(cx, move |loaded| {
        loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("createToken");
            }};
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/panel/tokens", Default::default()).unwrap();
            });

            on_cleanup(cx, move || drop(show_modal));
        });
    });

    //let query_map = loc.query;
    //let contains_success = move || query_map().get("success").is_some();

    let token_type = create_node_ref::<html::Select>(cx);
    let expiry = create_node_ref::<html::Select>(cx);
    let form = create_node_ref::<html::Form>(cx);

    let (needs_id, write_needs_id) = create_signal(cx, false);
    let (needs_custom_date, write_custom_date) = create_signal(cx, false);
    let needs_val = create_rw_signal(cx, false);

    view! {cx,
        <div class="modal mt-5 fade" id="createToken" _ref=modal_ref tabindex="-1">
        <div class="modal-dialog modal-sm" role="document">
            <div class="modal-content">
                <form on:submit=move |ev| {
                    ev.prevent_default();
                    let data = CreateTokenServer::from_event(&ev).expect("to parse form data");
                    log::debug!("{:?}", data);
                    needs_val.update(|nval| *nval = !*nval);
                    if !form.get().unwrap().check_validity() {
                        return
                    }
                   _  = &create_token_action.dispatch(data);
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
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-api-app mb-2 text-blue icon-lg" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                            <path d="M12 15h-6.5a2.5 2.5 0 1 1 0 -5h.5"></path>
                            <path d="M15 12v6.5a2.5 2.5 0 1 1 -5 0v-.5"></path>
                            <path d="M12 9h6.5a2.5 2.5 0 1 1 0 5h-.5"></path>
                            <path d="M9 12v-6.5a2.5 2.5 0 0 1 5 0v.5"></path>
                        </svg>
                        <h3>"Create new token!"</h3>
                    </div>

                    <div class="form-floating mb-3">
                            <input type="text" class="form-control" id="tokenname" name="tokenname" placeholder="Your token name"/>
                            <label for="tokenname">"Token name"</label>
                        </div>
                        <div class="form-floating mb-3">
                            <select class="form-select" id="selecttype" name="selecttype" aria-label="Token type" _ref=token_type on:input=move |_| {
                                let needs_update = match token_type() {
                                    Some(t) => {
                                        t.value() != "0"
                                    }
                                    None => {false}
                                };
                                write_needs_id(needs_update);
                            }>
                                <option value="0" selected>"Personal"</option>
                                <option value="1">"Collection"</option>
                                <option value="2">"Project"</option>
                            </select>
                            <label for="selecttype">"Select a tokentype"</label>
                        </div>
                        {move || if needs_id() {
                            view!{cx,
                                <div class="form-floating mb-3">
                                    <input type="text" class="form-control text-lowercase"
                                       pattern={{"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"}}
                                        id="resid" name="resid" placeholder="Resource UUID v4"
                                        required />
                                    <label for="resid">"UUIDv4"</label>
                                    <div class="invalid-feedback">
                                    "Invalid UUIDv4 expected format: '12345678-1234-4234-8234-123456789abc'"
                                    </div>
                                </div>
                                <div class="form-floating mb-3">
                                    <select class="form-select" id="selectperm" name="selectperm" aria-label="Token permissions"
                                        required>
                                        <option value="NONE" selected>"NONE"</option>
                                        <option value="READ">"READ"</option>
                                        <option value="APPEND">"APPEND"</option>
                                        <option value="MODIFY">"MODIFY"</option>
                                        <option value="ADMIN">"ADMIN"</option>
                                    </select>
                                    <label for="selectperm">"Token permissions"</label>
                                </div>
                            }.into_view(cx)

                            }else{
                                ().into_view(cx)
                            }
                        }
                        <div class="form-floating mb-3">
                            <select class="form-select" id="selectexpiry" name="selectexpiry" aria-label="Token expiry" _ref=expiry
                                on:input=move |_| {

                                    let needs_date = match expiry() {
                                        Some(t) => {
                                            log::debug!("{}", t.value());
                                            t.value() == "5"
                                        }
                                        None => {false}
                                    };
                                    write_custom_date(needs_date);
                                }
                            >
                                <option value="0" selected>"Never"</option>
                                <option value="1">"1 Day"</option>
                                <option value="2">"7 Days"</option>
                                <option value="3">"30 Days"</option>
                                <option value="4">"365 Days"</option>
                                <option value="5">"Custom"</option>
                            </select>
                            <label for="selectexpiry">"Token expiry time"</label>
                        </div>
                        {move || if needs_custom_date() {
                            view!{cx,
                                <div class="form-floating mb-3">
                                    <input type="date" class="form-control" id="customdate" name="customdate" required />
                                    <label for="customdate">"Choose a custom date"</label>
                                    <div class="invalid-feedback">
                                        "Required date for custom expiry"
                                    </div>
                                </div>
                                }.into_view(cx)
                            }else{
                                ().into_view(cx)
                            }

                        }


                </div>

                <div class="modal-footer">
                    <a href="/" class="btn" data-bs-dismiss="modal" data-bs-target="#createToken">
                    "Cancel"
                    </a>
                    <button type="submit" class="btn btn-primary ms-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-plus" width="24" height="24" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
