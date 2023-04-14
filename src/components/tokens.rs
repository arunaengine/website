use leptos::*;
use leptos_meta::*;
use leptos_router::*;

use crate::utils::structs::{TokenStats, UpdateTokens};

#[server(GetTokens, "/web")]
pub async fn get_tokens(
    #[allow(unused_variables)] cx: Scope,
) -> Result<Vec<TokenStats>, ServerFnError> {
    use crate::utils::aruna_api_handlers::aruna_get_api_tokens;
    use actix_session::SessionExt;
    use actix_web::HttpRequest;
    let req = use_context::<HttpRequest>(cx)
        .ok_or_else(|| ServerFnError::Request("Invalid context".to_string()))?;

    let sess = req.get_session();

    let token = sess
        .get::<String>("token")
        .map_err(|_| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?
        .ok_or_else(|| {
            log::debug!("Unable to query token from session 1");
            ServerFnError::Request("Invalid request".to_string())
        })?;

    let result = aruna_get_api_tokens(&token).await.map_err(|_| {
        log::debug!("Unable to query token from session 1");
        ServerFnError::Request("Invalid request".to_string())
    })?;

    Ok(result
        .token
        .into_iter()
        .map(TokenStats::from)
        .collect::<Vec<TokenStats>>())
}

#[component]
pub fn TokensOverview(cx: Scope) -> impl IntoView {
    use crate::components::create_token::*;
    use crate::components::token::*;

    provide_meta_context(cx);

    let update_tokens: UpdateTokens = UpdateTokens(create_rw_signal(cx, true));

    let get_tokens_res = create_resource(cx, update_tokens.0, move |_| async move {
        // this is the ServerFn that is called by the GetUser Action above
        get_tokens(cx).await.ok()
    });

    update_tokens.0.update(|e| *e = !*e);

    let sessions = move || {
        get_tokens_res
            .read(cx)
            .flatten()
            .map(|ve| {
                ve.into_iter()
                    .filter_map(|elem| if elem.is_session { Some(elem) } else { None })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };

    let tokens = move || {
        get_tokens_res
            .read(cx)
            .flatten()
            .map(|ve| {
                ve.into_iter()
                    .filter_map(|elem| if !elem.is_session { Some(elem) } else { None })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    };

    let location = use_location(cx);
    let query_map = location.query;
    let contains_create = move || query_map().get("create").is_some();
    let create_token_action = create_server_action::<CreateTokenServer>(cx);
    let current_action_version = create_rw_signal(cx, 0);

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
                        </tr>
                        {
                            move || if !tokens().is_empty() {
                                view!{cx,
                                <For
                                    // a function that returns the items we're iterating over; a signal is fine
                                    each=tokens
                                    // a unique key for each item
                                    key=|tok| tok.id.clone()
                                    // renders each item to a view
                                    view=move |cx, tok: TokenStats| {
                                    view! {
                                        cx,
                                        <Token token_info=tok/>
                                    }
                                    }
                                />}.into_view(cx)
                            }else{
                                view!{cx, <tr><td colspan="4" class="text-center">"Looks like you currently have no active tokens!"</td></tr>}.into_view(cx)
                            }
                        }
                        </tbody>
                    </table>
                </div>
                <div class="card-footer p-0">
                    <div class="d-flex">
                        <A href="?create" class="btn btn-primary ms-auto m-1">
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
                        <th class="w-3 text-center">"Actions"</th>
                    </tr>
                    </thead>
                    <tbody>
                        {
                            move || if !sessions().is_empty() {
                                view!{cx,
                                <For
                                    // a function that returns the items we're iterating over; a signal is fine
                                    each=sessions
                                    // a unique key for each item
                                    key=|sess| sess.id.clone()
                                    // renders each item to a view
                                    view=move |cx, sess: TokenStats| {
                                    view! {
                                        cx,
                                        <Session token_info=sess is_current=true/>
                                    }
                                    }
                                />}.into_view(cx)
                            }else{
                                view!{cx, <tr><td colspan="4" class="text-center">"Looks like you currently have no active sessions!"</td></tr>}.into_view(cx)
                            }
                        }
                    </tbody>
                </table>
            </div>
        </div>
    </div>

        {
            move ||
                if contains_create(){
                    view!{cx, <CreateToken create_token_action/>}.into_view(cx)
                }else{
                    {   // This guarantees that every result can only be seen once
                        if create_token_action.version()() > current_action_version() {
                            current_action_version.set(create_token_action.version()());
                            match create_token_action.value().get(){
                                Some(Ok(resp)) => view!{cx,
                                    <CreateTokenSuccess create_token_resp=resp/>
                                }.into_view(cx),
                                Some(Err(_)) => view!{cx,
                                    "Something went wrong"
                                }.into_view(cx),
                                None => ().into_view(cx)
                            }
                        }else{
                            ().into_view(cx)
                        }

                    }
                }
        }
    }
}