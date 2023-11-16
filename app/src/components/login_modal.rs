use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;


#[server]
pub async fn get_provider_names() -> Result<Vec<String>, ServerFnError> {
    use crate::utils::oidc::Authorizer;
    let Some(oidc_handlers) = use_context::<Vec<(String, Authorizer)>>() else {
        return Err(ServerFnError::Args("Missing oidc handler".to_string()));
    };
    Ok(oidc_handlers.iter().map(|(a, _)| a.to_string()).collect())
}

#[component]
pub fn Provider(name: String) -> impl IntoView {
    let name_clone = name.clone();
    let href = move || format!("/login?oidc={}", name_clone);
    view!{
        <a href=href.clone() class="btn w-100" on:click=move |_| {
            let _ = window().location().set_href(&format!("/login?oidc={}", href.clone()()));
        }>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-key" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0z" /><path d="M15 9h.01" /></svg>
            {format!("Login with {}", name)}
        </a>
    }
}


/// Renders the home page of your application.
#[component]
pub fn LoginModal() -> impl IntoView {

    provide_meta_context();


    let provider_res = create_resource(move || (), |_| get_provider_names());

    let nav = use_navigate();
    let modal_ref = create_node_ref::<html::Div>();
    modal_ref.on_load(move |loaded| {
        let _ = loaded.on_mount(move |mounted| {
            cfg_if! {
                if #[cfg(feature = "hydrate")] {
                    use crate::utils::modal::show_modal;
                    show_modal("loginModal");
                }
            };
            let show_modal = EventListener::new(&mounted, "hide.bs.modal", move |_event| {
                nav("/", Default::default());
            });

            on_cleanup(move || {
                drop(show_modal)
            });
        });
    });


    let providers = move || provider_res.get().map(|r| r.ok()).flatten().unwrap_or_default();

    view! {
            <div class="modal mt-5 fade" id="loginModal" _ref=modal_ref tabindex="-1">
                <div class="modal-dialog modal-sm" role="document">
                    <div class="modal-content">
                        <div class="modal-status bg-info"></div>
                        <div class="modal-body">
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
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
                                <h3>"Login"</h3>
                                <div class="text-muted">
                                    <div>"Please choose your login provider!"</div>
                                </div>
                            </div>
                            <Transition
                                fallback= move || ()
                            >
                            <For
                            // a function that returns the items we're iterating over; a signal is fine
                            each=providers
                            // a unique key for each item
                            key=|name| name.to_string() 
                            // renders each item to a view
                            children=move |name: String| {
                              view! {
                                <Provider name=name/>
                              }
                            }
                            />
                            </Transition>
                        </div>
                    </div>
                </div>
            </div>
    }
}
