use leptos::*;

#[component]
pub fn PanelContent(cx: Scope) -> impl IntoView {
    view! {cx,
        <div class="modal" id="panel-content" tabindex="-1">
        <div class="modal-dialog modal-sm" role="document">
          <div class="modal-content">
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            <div class="modal-status bg-info"></div>
            <div class="modal-body text-center py-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-square mb-2 text-info icon-lg" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M12 9h.01"></path>
                <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"></path>
                <path d="M11 12h1v4h1"></path>
              </svg>
              <h3>"Notice"</h3>
              <div class="text-muted">"Please note that this website is still heavily work in progress. Expect visual bugs, glitches and issues. We are actively working on this and hope to update this website soon. If you have any issues, especially regarding the API-Token creation please open an issue at: https://github.com/ArunaStorage/ArunaWeb or write an email to support@aruna-storage.org"</div>
            </div>
            <div class="modal-footer">
              <div class="w-100">
                <div class="row">
                  <div class="col"><a href="#" class="btn w-100" data-bs-dismiss="modal">
                      "Cancel"
                    </a></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
}
