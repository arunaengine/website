use anyhow::Result;
use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::TokenResponse;

#[server(CreateTokenServer, "/web")]
pub async fn create_token_server(
    #[allow(unused_variables)] cx: Scope,
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: String,
    selectexpiry: String,
    customdate: Option<String>,
) -> Result<TokenResponse, ServerFnError> {
    dbg!(
        tokenname,
        selecttype,
        resid,
        selectperm,
        selectexpiry,
        customdate
    );
    Ok(TokenResponse::default())
}

#[component]
pub fn CreateToken(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);

    let nav = use_navigate(cx);
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

    let token_name = create_node_ref::<html::Input>(cx);
    let token_type = create_node_ref::<html::Select>(cx);
    let res_id = create_node_ref::<html::Input>(cx);
    let res_perm = create_node_ref::<html::Select>(cx);
    let expiry = create_node_ref::<html::Select>(cx);
    let custom_date = create_node_ref::<html::Input>(cx);
    let form = create_node_ref::<html::Form>(cx);

    let create_token_action = create_server_action::<CreateTokenServer>(cx);
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
                        ev.prevent_default();
                    }
                   _  = &create_token_action.dispatch(data);
                    }
                    class="needs-validation"
                    class:was-validated=move || needs_val()
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
                            <input type="text" class="form-control" id="tokenname" name="tokenname" placeholder="Your token name"
                                _ref=token_name/>
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
                                        id="resid" name="resid" placeholder="Resource UUID v4" _ref=res_id
                                        required />
                                    <label for="resid">"UUIDv4"</label>
                                    <div class="invalid-feedback">
                                    "Invalid UUIDv4 expected format: '12345678-1234-4234-8234-123456789abc'"
                                    </div>
                                </div>
                            }.into_view(cx)

                            }else{
                                ().into_view(cx)
                            }
                        }
                        <div class="form-floating mb-3">
                            <select class="form-select" id="selectperm" name="selectperm" aria-label="Token permissions"
                                _ref=res_perm required>
                                <option value="NONE" selected>"NONE"</option>
                                <option value="READ">"READ"</option>
                                <option value="APPEND">"APPEND"</option>
                                <option value="MODIFY">"MODIFY"</option>
                                <option value="ADMIN">"ADMIN"</option>
                            </select>
                            <label for="selectperm">"Token permissions"</label>
                        </div>
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
                                    <input type="date" class="form-control" id="customdate" name="customdate" _ref=custom_date required />
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
