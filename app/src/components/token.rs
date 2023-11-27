use leptos::*;
use leptos_meta::*;

use crate::utils::structs::UpdateTokens;
use aruna_rust_api::api::storage::models::v2::permission::ResourceId;
use aruna_rust_api::api::storage::models::v2::Token;

#[server]
pub async fn delete_token(token_id: String) -> Result<(), ServerFnError> {
    use crate::utils::aruna_api_handlers::ConnectionHandler;
    use crate::utils::login_helpers::{extract_token, LoginResult};

    let LoginResult::ValidToken(token) = extract_token().await else {
        return Err(ServerFnError::ServerError("NotLoggedIn".to_string()));
    };
    ConnectionHandler::aruna_delete_api_token(token_id, &token)
        .await
        .map_err(|_| {
            leptos::logging::log!("Unable to query SearchResults");
            ServerFnError::Request("Error accessing SearchResult".to_string())
        })?;
    Ok(())
}

/// Renders the home page of your application.
#[component]
pub fn Token(token_info: Token) -> impl IntoView {
    provide_meta_context();

    let token_id = store_value(token_info.id.to_string());

    let update_tokens = use_context::<UpdateTokens>().expect("user_state not set");

    let (deleting, set_deleting) = create_signal("".to_string());

    let dispatch_delete = create_resource(deleting, move |del| async move {
        // this is the ServerFn that is called by the GetUser Action above
        if !del.is_empty() {
            delete_token(del).await.ok();
            update_tokens.0.update(move |e| *e = !*e)
        }
    });

    view! {
        <tr>
            <td>{token_info.id.clone()}</td>
            <td>{token_info.name.clone()}</td>
            // <td>{token_info.used_at.clone()}</td>
            <td>
                <div class="d-flex justify-content-end">
                    <a
                        href="#"
                        class="btn btn btn-icon mx-2 btn-sm my-accordion-icon"
                        role="button"
                        aria-label="Button"
                        data-bs-toggle="collapse"
                        data-bs-target=format!(r##"#S{}"##, token_info.id)
                        aria-expanded="false"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="icon icon-tabler icon-tabler-arrow-down"
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
                            <path d="M18 13l-6 6"></path>
                            <path d="M6 13l6 6"></path>
                        </svg>
                    </a>
                    <a
                        href="#"
                        class="btn btn-danger btn-icon btn-sm"
                        aria-label="Button"
                        role="button"
                        on:click=move |_| { set_deleting.set(token_id.get_value()) }
                    >
                        <Suspense fallback=move || {
                            view! { <div class="spinner-border"></div> }
                        }>
                            {move || {
                                let _ = dispatch_delete.get();
                                view! {
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        class="icon icon-tabler icon-tabler-trash"
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
        <tr
            class="accordion-collapse collapse"
            id=format!("S{}", token_info.id.clone())
            data-bs-parent="#tokenTable"
        >
            <td colspan="4">
                <div class="card card-borderless">
                    <div class="card-body accordion-body">
                        <div class="datagrid">
                            <div class="datagrid-item">
                                <div class="datagrid-title">"ID"</div>
                                <div class="datagrid-content">{token_info.id.clone()}</div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Name"</div>
                                <div class="datagrid-content">{token_info.name.clone()}</div>
                            </div>
                            // <div class="datagrid-item">
                            // <div class="datagrid-title">"Type"</div>
                            // <div class="datagrid-content">
                            // {token_info.token_type.get_type_variant()}
                            // </div>
                            // </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Target"</div>
                                <div class="datagrid-content">
                                    {match token_info.permission.clone() {
                                        Some(perm) => {
                                            match perm.resource_id {
                                                Some(res_id) => {
                                                    match res_id {
                                                        ResourceId::ObjectId(id)
                                                        | ResourceId::DatasetId(id)
                                                        | ResourceId::CollectionId(id)
                                                        | ResourceId::ProjectId(id) => id,
                                                    }
                                                }
                                                None => String::new(),
                                            }
                                        }
                                        None => String::new(),
                                    }}

                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Permission level"</div>
                                <div class="datagrid-content">

                                    {match token_info.permission {
                                        Some(perm) => {
                                            match perm.permission_level {
                                                2 => "None".to_string(),
                                                3 => "Read".to_string(),
                                                4 => "Append".to_string(),
                                                5 => "Write".to_string(),
                                                6 => "Admin".to_string(),
                                                _ => "Invalid permission level".to_string(),
                                            }
                                        }
                                        None => String::new(),
                                    }}

                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Created at"</div>
                                <div class="datagrid-content">
                                    {match token_info.created_at {
                                        Some(timestamp) => timestamp.to_string(),
                                        None => String::new(),
                                    }}
                                </div>
                            </div>
                            <div class="datagrid-item">
                                <div class="datagrid-title">"Expires at"</div>
                                <div class="datagrid-content">
                                    {match token_info.expires_at {
                                        Some(timestamp) => timestamp.to_string(),
                                        None => String::new(),
                                    }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    }
}
