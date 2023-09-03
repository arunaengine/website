use cfg_if::cfg_if;
use http::status::StatusCode;
use leptos::*;
use leptos_meta::*;
use thiserror::Error;

#[cfg(feature = "ssr")]
use leptos_axum::ResponseOptions;

#[derive(Clone, Debug, Error)]
pub enum AppError {
    #[error("Not Found")]
    NotFound,
}

impl AppError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            AppError::NotFound => StatusCode::NOT_FOUND,
        }
    }
}

// A basic function to display errors served by the error boundaries.
// Feel free to do more complicated things here than just displaying the error.
#[component]
pub fn ErrorTemplate(
    #[prop(optional)] outside_errors: Option<Errors>,
    #[prop(optional)] errors: Option<RwSignal<Errors>>,
) -> impl IntoView {
    let errors = match outside_errors {
        Some(e) => create_rw_signal(e),
        None => match errors {
            Some(e) => e,
            None => panic!("No Errors found and we expected errors!"),
        },
    };
    // Get Errors from Signal
    let errors = errors.get();

    // Downcast lets us take a type that implements `std::error::Error`
    let errors: Vec<AppError> = errors
        .into_iter()
        .filter_map(|(_k, v)| v.downcast_ref::<AppError>().cloned())
        .collect();
    println!("Errors: {errors:#?}");

    // Only the response code for the first error is actually sent from the server
    // this may be customized by the specific application
    cfg_if! { if #[cfg(feature="ssr")] {
        let response = use_context::<ResponseOptions>();
        if let Some(response) = response {
            response.set_status(errors[0].status_code());
        }
    }}

    view! {
        <Stylesheet href="/tabler.min.css"/>
        <Stylesheet id="leptos" href="/pkg/aruna_web_workspace.css"/>
        <Script src="/tabler.min.js"/>
        // sets the document title
        <Title text="Aruna Object Storage"/>
        <For
            // a function that returns the items we're iterating over; a signal is fine
            each=move || { errors.clone().into_iter().enumerate() }
            // a unique key for each item as a reference
            key=|(index, _error)| *index
            // renders each item to a view
            view=move |error| {
                let error_string = error.1.to_string();
                let error_code = error.1.status_code();
                view! {
                    <body class=" border-top-wide border-primary d-flex flex-column">
                        <div class="page page-center">
                            <div class="container-tight py-4">
                                <div class="empty">
                                    <div class="empty-header">
                                        {error_code.as_u16().to_string()}
                                    </div>
                                    <p class="empty-title">
                                        "Oops… You just found an error page"
                                    </p>
                                    <p class="empty-subtitle text-secondary">
                                          We are sorry but something went wrong:
                                        {error_string.to_string()}
                                    </p>
                                    <div class="empty-action">
                                        <a class="btn btn-primary" onclick="window.location.reload(history.back());">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                class="icon"
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                stroke-width="2"
                                                stroke="currentColor"
                                                fill="none"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                                                <path d="M5 12l14 0"></path>
                                                <path d="M5 12l6 6"></path>
                                                <path d="M5 12l6 -6"></path>
                                            </svg>
                                              Take me home
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </body>
                }
            }
        />
    }
}
