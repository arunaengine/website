use leptos::*;
use leptos_meta::*;

/// Renders the home page of your application.
#[component]
pub fn PanelBody(cx: Scope) -> impl IntoView {
    use super::greeter::*;
    use super::register::*;

    provide_meta_context(cx);
    // Creates a reactive value to update the button

    let logged_in = true;

    view! {cx,
        <div class="page-wrapper">
            <div class="page-body">
                <div class="container">
                    <div class="row row-deck row-cards">
                        <div class="col-lg-12 ms-auto">
                            <Greeter/>
                        </div>
                        <div class="col-lg-12 ms-auto">
                            <Show when=move || logged_in fallback=|_cx| ()><RegisterPage/></Show>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }
}
