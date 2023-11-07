use crate::utils::structs::UpdateTokens;
use aruna_rust_api::api::storage::models::v2::Token;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

#[server(GetTokens)]
pub async fn get_tokens() -> Result<Vec<Token>, ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };
    let res = ConnectionHandler::aruna_get_api_tokens(&token)
        .await
        .map_err(|_| {
            leptos::logging::log!("Unable to query SearchResults");
            ServerFnError::Request("Error accessing SearchResult".to_string())
        })?;
    Ok(res.tokens)
}

#[component]
pub fn TokensOverview() -> impl IntoView {
    use crate::components::create_token::*;
    use crate::components::token::*;

    provide_meta_context();

    let update_tokens: UpdateTokens = UpdateTokens(create_rw_signal(true));

    let get_tokens_res = create_resource(update_tokens.0, move |_| async move {
        // this is the ServerFn that is called by the GetUser Action above
        get_tokens().await
    });

    update_tokens.0.update(|e| *e = !*e);

    provide_context(update_tokens);

    let nav = use_navigate();

    let has_failed = move || {
        if let Some(Err(_)) = get_tokens_res.get() {
            true
        } else {
            false
        }
    };

    let get_tokens = move || {
        if let Some(Ok(tokens)) = get_tokens_res.get() {
            tokens
        } else {
            vec![]
        }
    };

    let tokens_empty = move || get_tokens().is_empty();

    let location = use_location();
    let query_map = location.query;
    let contains_create = move || query_map().get("create").is_some();
    let create_token_action = create_server_action::<CreateTokenServer>();
    let current_action_version = create_rw_signal(0);

    view! {
        {
            move || if has_failed() {
                nav("/", NavigateOptions::default())
            }
        }
        <div class="container-xl mt-3">
            <div class="row mb-4">
                <div class="col">
                    <div class="page-pretitle text-start">
                        Personal Permissions
                    </div>
                    <h2 class="page-title">
                        Tokens
                    </h2>
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
                                <th class="w-3 text-end">"Actions"</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr></tr>
                            <Transition fallback=move || {
                                view! {
                                    <tr>
                                        <td colspan="4" class="text-center">
                                            <div class="spinner-border"></div>
                                        </td>
                                    </tr>
                                }
                            }>

                                <Show
                                    when=move || !tokens_empty()
                                    fallback=move || {
                                        view! {
                                            <tr>
                                                <td colspan="4" class="text-center">
                                                    "Looks like you currently have no active tokens!"
                                                </td>
                                            </tr>
                                        }
                                    }
                                >
                                        {
                                            move || { get_tokens()
                                            .into_iter()
                                            .map(|item| {
                                                view! { <Token token_info=item/> }
                                            })
                                            .collect::<Vec<_>>()
                                            .into_view()
                                        }}
                                </Show>


                            </Transition>
                        </tbody>
                    </table>
                </div>
                <div class="card-footer p-0">
                    <div class="d-flex">
                        <A href="?create" class="btn btn-primary ms-auto m-1">
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
                            "Create Token"
                        </A>
                    </div>
                </div>
            </div>
        </div>

        {move || {
            if contains_create() {
                view! {
                    ,
                    <CreateToken create_token_action/>
                }
                    .into_view()
            } else {
                {
                    if create_token_action.version()() > current_action_version() {
                        current_action_version.set(create_token_action.version()());
                        match create_token_action.value().get() {
                            Some(Ok(resp)) => {
                                view! {
                                    <CreateTokenSuccess create_token_resp=resp/>
                                }
                                    .into_view()
                            }
                            Some(Err(_)) => {
                                view! {
                                    "Something went wrong"
                                }
                                    .into_view()
                            }
                            None => ().into_view(),
                        }
                    } else {
                        ().into_view()
                    }
                }
            }
        }}
    }
}
