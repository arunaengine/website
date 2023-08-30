use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn AlertModal<F>(
    header: String,
    message: String,
    modal_id: String,
    action_name: String,
    action: F,
) -> impl IntoView
where
    F: FnMut(ev::MouseEvent) + 'static,
{
    provide_meta_context();

    view! {
        <div class="modal" id=modal_id tabindex="-1">
        <div class="modal-dialog modal-sm" role="document">
          <div class="modal-content">
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            <div class="modal-status bg-danger"></div>
            <div class="modal-body text-center py-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-alert-triangle mb-2 text-danger icon-lg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <path d="M12 9v2m0 4v.01" />
                <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
              </svg>
              <h3>{header}</h3>
              <div class="text-muted">{message}</div>
            </div>
            <div class="modal-footer">
              <div class="w-100">
                <div class="row">
                  <div class="col"><a href="#" class="btn w-100" data-bs-dismiss="modal">
                      "Cancel"
                    </a></div>
                  <div class="col"><a href="#" class="btn btn-danger w-100" data-bs-dismiss="modal" on:click=action>
                      {action_name}
                    </a></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
}
