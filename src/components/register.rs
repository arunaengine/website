use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn RegisterPage(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);
    // Creates a reactive value to update the button
    view! {cx,
        <div class="card mx-auto m-3 w-75 p-4" style="max-width: 800px;">
          <div class="card-body">
              <div class="alert alert-warning" role="alert">
              "You must register with an display name first. Afterwards, your request will be"
              </div>

              <div class="input-group">
                  <span class="input-group-text" id="basic-addon3">"Display Name"</span>
                  <input type="text" class="form-control" id="basic-url" v-model="field" aria-describedby="basic-addon3" />
                  <button class="btn btn-outline-success" type="button" id="button-addon2">"Register"</button>
              </div>
          </div>
      </div>
    }
}
