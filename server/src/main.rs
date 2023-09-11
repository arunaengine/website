use aruna_web_app::*;
use axum::{
    extract::FromRef,
    http::Method,
    routing::{get, post},
    Router,
};
use fileserv::file_and_error_handler;
use leptos::*;
use leptos_axum::{generate_route_list, LeptosRoutes};
use tower_http::cors::{Any, CorsLayer};

use crate::routes::{callback, login, refresh};

pub mod fileserv;
pub mod oidc;
pub mod routes;

#[derive(FromRef, Clone)]
pub struct ServerState {
    pub oidc: oidc::Authorizer,
    pub leptos_options: LeptosOptions,
}

#[tokio::main]
async fn main() {
    simple_logger::init_with_level(log::Level::Debug).expect("couldn't initialize logging");

    dotenvy::dotenv().expect("couldn't load .env file");

    let key_cloak_url = std::env::var("KEYCLOAK_URL").expect("Keycloak URL must be set!");

    // Setting get_configuration(None) means we'll be using cargo-leptos's env values
    // For deployment these variables are:
    // <https://github.com/leptos-rs/start-axum#executing-a-server-on-a-remote-machine-without-the-toolchain>
    // Alternately a file can be specified such as Some("Cargo.toml")
    // The file would need to be included with the executable when moved to deployment
    let conf = get_configuration(None).await.unwrap();
    let leptos_options = conf.leptos_options;
    // let server_state = ServerState {
    //     oidc: oidc::Authorizer::new(key_cloak_url)
    //         .await
    //         .expect("Unable to initialize authorizer"),
    //     leptos_options: leptos_options.clone(),
    // };
    let addr = leptos_options.site_addr;
    let routes = generate_route_list(|| view! { <EntryPoint/> }).await;

    // let cors = CorsLayer::new()
    //     // allow `GET` and `POST` when accessing the resource
    //     .allow_methods([Method::GET, Method::POST])
    //     // allow requests from any origin
    //     .allow_origin(Any);

    // build our application with a route
    let app = Router::new()
        .route(
            "/api/*fn_name",
            post(leptos_axum::handle_server_fns).get(leptos_axum::handle_server_fns),
        )
        // .route("/login", get(login))
        // .route("/callback", get(callback))
        // .route("/oidc-callback", get(callback))
        // .route("/refresh", get(refresh))
        .leptos_routes(&leptos_options, routes, || view! { <EntryPoint/> })
        .fallback(file_and_error_handler)
        .with_state(leptos_options);

    // run our app with hyper
    // `axum::Server` is a re-export of `hyper::Server`
    log!("listening on http://{}", &addr);
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
