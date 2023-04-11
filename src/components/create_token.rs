use cfg_if::cfg_if;
use gloo_events::EventListener;
use leptos::*;
use leptos_meta::*;
use leptos_router::*;

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

    view! {cx,
        <div class="modal mt-5 fade" id="createToken" _ref=modal_ref tabindex="-1">
        <div class="modal-dialog modal-sm" role="document">
            <div class="modal-content">
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
                    <div class="mx-auto text-left import-left">
                        <div class="mb-3">
                            <label class="form-label text-left">"Token"</label>
                            <input type="text" class="form-control flex-fill" name="displayname" placeholder="" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label text-left import-left">"Email (optional)"</label>
                            <input type="text" class="form-control flex-fill" name="email" placeholder="" />
                        </div>
                        <div class="mb-3">
                            <label class="form-label text-left import-left">"Project (optional)"</label>
                            <input type="text" class="form-control flex-fill" name="project" placeholder="" />
                        </div>
                    </div>
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
            </div>
        </div>
    </div>
    }
}
