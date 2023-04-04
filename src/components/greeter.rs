use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn Greeter(cx: Scope) -> impl IntoView {
    provide_meta_context(cx);
    // Creates a reactive value to update the button
    view! {cx,
    <div class="card m-3 w-75 p-4">
        <div class="card-body">
            <img src="aruna_light.png" class="card-img-top" alt="AOS"/>
                <p class="card-text fs-6 mt-4">
                "Welcome to the register- and management page for "
                <b>"Aruna Object Storage (AOS)"</b>". Documentation and further information
                is available via the links below."
                </p>
                <a href="https://github.com/ArunaStorage/ArunaServer" class="card-link">"GitHub"</a>
                <a href="https://github.com/ArunaStorage/Documentation" class="card-link">"Documentation"</a>
                <a href="https://api.aruna.nfdi-dev.gi.denbi.de" class="card-link">"API"</a>

            <div class="alert alert-warning mt-4" role="alert">
            "Please login to proceed."
            </div>
        </div>
    </div>
    }
}
