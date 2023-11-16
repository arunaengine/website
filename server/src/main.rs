use std::fs::File;

use aruna_web_app::{
    utils::{mail::MailClient, oidc},
    *,
};
use axum::{
    body::Body as AxumBody,
    extract::{FromRef, Path, RawQuery, State},
    http::{HeaderMap, Method, Request},
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use axum_extra::extract::cookie::Key;
use fileserv::file_and_error_handler;
use leptos::logging::log;
use leptos::*;
use leptos_axum::{generate_route_list, handle_server_fns_with_context, LeptosRoutes};
use tower_http::cors::{Any, CorsLayer};

use crate::{
    routes::{callback, login, logout, refresh},
    utils::Config,
};

pub mod fileserv;
pub mod routes;
pub mod utils;

async fn server_fn_handler(
    State(app_state): State<ServerState>,
    path: Path<String>,
    headers: HeaderMap,
    raw_query: RawQuery,
    request: Request<AxumBody>,
) -> impl IntoResponse {
    handle_server_fns_with_context(
        path,
        headers,
        raw_query,
        move || {
            provide_context(app_state.mail.clone());
            provide_context(app_state.oidcs.clone());
            provide_context(app_state.key.clone());
        },
        request,
    )
    .await
}

async fn leptos_routes_handler(
    State(app_state): State<ServerState>,
    req: Request<AxumBody>,
) -> Response {
    let handler = leptos_axum::render_app_to_stream_with_context(
        app_state.leptos_options.clone(),
        move || {
            provide_context(app_state.mail.clone());
            provide_context(app_state.oidcs.clone());
            provide_context(app_state.key.clone());
        },
        || view! { <EntryPoint/> },
    );
    handler(req).await.into_response()
}

#[derive(FromRef, Clone)]
pub struct ServerState {
    pub oidcs: Vec<(String, oidc::Authorizer)>,
    pub mail: Option<aruna_web_app::utils::mail::MailClient>,
    pub key: Key,
    pub leptos_options: LeptosOptions,
}

impl ServerState {
    pub fn get_oidc(&self, name: &str) -> Option<&oidc::Authorizer> {
        self.oidcs
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, oidc)| oidc)
    }
}

#[tokio::main]
async fn main() {
    simple_logger::init_with_level(log::Level::Debug).expect("couldn't initialize logging");
    dotenvy::dotenv().expect("couldn't load .env file");
    let conf = get_configuration(None).await.unwrap();
    let leptos_options = conf.leptos_options;
    let mail_client = if let Ok(val) = dotenvy::var("DEV_MODE") {
        if &val == "true" {
            None
        } else {
            Some(MailClient::new().expect("Failed to create mail client"))
        }
    } else {
        Some(MailClient::new().expect("Failed to create mail client"))
    };

    let config: Config =
        toml::from_str(
            std::io::read_to_string(
                File::open(
                    &dotenvy::var("OIDC_CONFIG").expect("OIDC_CONFIG must be set!")
                ).expect("Failed to open OIDC_CONFIG file")
            ).expect("Failed to read OIDC_CONFIG").as_str())
            .expect("Failed to parse OIDC_CONFIG");

    let server_state = ServerState {
        oidcs: config
            .into_authorizers()
            .await
            .expect("Failed to create authorizers"),
        mail: mail_client,
        key: Key::from(
            dotenvy::var("ENCRYPTION_KEY")
                .expect("KEY must be set!")
                .as_bytes(),
        ),
        leptos_options: leptos_options.clone(),
    };
    let addr = leptos_options.site_addr;
    let routes = generate_route_list(|| view! { <EntryPoint/> });

    let cors = CorsLayer::new()
        // allow `GET` and `POST` when accessing the resource
        .allow_methods([Method::GET, Method::POST])
        // allow requests from any origin
        .allow_origin(Any);

    // build our application with a route
    let app = Router::new()
        .layer(cors)
        .route(
            "/api/*fn_name",
            post(server_fn_handler).get(server_fn_handler),
        )
        .route("/login", get(login))
        .route("/callback", get(callback))
        .route("/oidc-callback", get(callback))
        .route("/refresh", get(refresh))
        .route("/logout", get(logout))
        .leptos_routes_with_handler(routes, leptos_routes_handler)
        .fallback(file_and_error_handler)
        .with_state(server_state);

    // run our app with hyper
    // `axum::Server` is a re-export of `hyper::Server`
    log!("listening on http://{}", &addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
