use leptos::*;

#[component]
pub fn PanelContent(cx: Scope) -> impl IntoView {
    view! {cx,
      <div class="card">
        <div class="card-status-start bg-warning"></div>
        <div class="card-body">
        <h3 class="card-title">"Notice"</h3>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-info-square mb-2 text-warning icon-lg" width="40" height="40" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
              <path d="M12 9h.01"></path>
              <path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14z"></path>
              <path d="M11 12h1v4h1"></path>
            </svg>
          </div>
          <div>
            <p class="text-muted">"Please note that this website is still heavily work in progress. Expect visual bugs, glitches and issues."</p>
            <p class="text-muted">"We are actively working on this and hope to update this website soon. If you have any issues, especially regarding the API-Token creation please open an issue at:"</p>
            <a href="https://github.com/ArunaStorage/ArunaWeb">"https://github.com/ArunaStorage/ArunaWeb"</a>
            <p class="text-muted">"or write an email to"</p>
            <a href="mailto:support@aruna-storage.org">"support@aruna-storage.org"</a>
          </div>
        </div>
    </div>
    }
}
