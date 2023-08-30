use leptos::*;
use leptos_meta::*;

#[component]
pub fn Footer() -> impl IntoView {
    provide_meta_context();

    view! {
        <footer class="container-xl d-flex flex-wrap justify-content-between align-items-center py-3 my-4 border-top">
        <p class="col-md-4 mb-0 text-muted">{"© 2023 Aruna Storage Team"}</p>

        <a href="https://tabler.io/" class="col-md-4 d-flex align-items-center justify-content-center mb-3 mb-md-0 me-md-auto link-dark text-decoration-none">
            "Built with tabler.io"
        </a>

        <ul class="nav col-md-4 justify-content-end">
        <li class="nav-item"><a href="/" class="nav-link px-2 text-muted">{"Home"}</a></li>
        <li class="nav-item"><a href="/#faq" class="nav-link px-2 text-muted">{"FAQs"}</a></li>
        <li class="nav-item"><a href="/about" class="nav-link px-2 text-muted">{"About"}</a></li>
        <li class="nav-item"><a href="/imprint" class="nav-link px-2 text-muted">{"Imprint"}</a></li>
        <li class="nav-item"><a href="/tos" class="nav-link px-2 text-muted">{"Terms of Service"}</a></li>
        </ul>
        </footer>
    }
}
