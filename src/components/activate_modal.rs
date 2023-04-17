use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn ActivateModal(cx: Scope, user_id: String) -> impl IntoView {
    provide_meta_context(cx);

    view! {cx,
        <div class="modal" id=format!("AV{}", user_id.clone()) tabindex="-1">
        <div class="modal-dialog modal-sm" role="document">
          <div class="modal-content">
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            <div class="modal-status bg-success"></div>
            <div class="modal-body text-center py-4">
              <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-user-check icon-lg text-success" width="40" height="40" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                  <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path>
                  <path d="M6 21v-2a4 4 0 0 1 4 -4h4"></path>
                  <path d="M15 19l2 2l4 -4"></path>
              </svg>
              <h3>{"Activate user"}</h3>
              <div class="text-muted mb-3">{format!("ID: {user_id}")}</div>
              <div class="form-floating mb-3">
                  <input type="text" class="form-control text-lowercase"
                      id="projid" name="projid" placeholder="Project ID"
                      required />
                  <label for="projid">"Project ULID"</label>
                  <div class="invalid-feedback">
                  "Invalid ULID expected format: '01BX5ZZKBKACTAV9WEVGEMMVRY'"
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
                  <label for="selectperm">"Project permissions"</label>
              </div>
            </div>
            <div class="modal-footer">
              <div class="w-100">
                <div class="row">
                  <div class="col"><a href="#" class="btn w-100" data-bs-dismiss="modal">
                      "Cancel"
                    </a></div>
                  <div class="col"><a href="#" class="btn btn-success w-100" data-bs-dismiss="modal" on:click=move |_| {}>
                      "Activate"
                    </a></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
}