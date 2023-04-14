pub mod app;
mod components;
pub mod server;
pub mod utils;

#[cfg(feature = "ssr")]
#[actix_web::main]
async fn main() -> std::io::Result<()> {
    use actix_files::Files;
    use actix_session::{storage::CookieSessionStore, SessionMiddleware};
    use actix_web::web::Data;
    use actix_web::*;
    use aruna_web::app::*;
    use leptos::*;
    use leptos_actix::{generate_route_list, LeptosRoutes};
    //use server::aruna_cache::Cache;
    use server::oidc::Authorizer;
    use std::sync::Mutex;
    //use server::actix_routes;

    let conf = get_configuration(None).await.unwrap();
    let addr = conf.leptos_options.site_addr;
    // Generate the list of routes in your Leptos App
    let routes = generate_route_list(|cx| view! { cx, <EntryPoint/> });

    let secret_key =
        cookie::Key::from(b"V958suBe8ahDpZ2GisN2WdczagtojTwzHX5DZ53b9x5XCbVfG8DAUUfqpnXUDDMx");

    crate::components::register_server_functions();

    let authorizer = Data::new(Mutex::new(
        Authorizer::new("http://localhost:1998/realms/test".to_string())
            .await
            .unwrap(),
    ));

    //let cache = Data::new(Mutex::new(Cache::new()));

    HttpServer::new(move || {
        let leptos_options = &conf.leptos_options;
        let site_root = &leptos_options.site_root;

        App::new()
            .wrap(
                SessionMiddleware::builder(CookieSessionStore::default(), secret_key.clone())
                    .session_lifecycle(
                        actix_session::config::PersistentSession::default()
                            .session_ttl(cookie::time::Duration::seconds(60 * 60 * 24 * 7)),
                    )
                    .cookie_name("aruna-session".to_string())
                    .build(),
            )
            .app_data(authorizer.clone())
            .service(server::actix_routes::login)
            .service(server::actix_routes::logout)
            .service(server::actix_routes::callback)
            .route("/web/{tail:.*}", leptos_actix::handle_server_fns())
            .leptos_routes(
                leptos_options.to_owned(),
                routes.to_owned(),
                |cx| view! { cx, <EntryPoint/> },
            )
            .service(Files::new("/", site_root))
    })
    .bind(&addr)?
    .run()
    .await
}

#[cfg(not(feature = "ssr"))]
pub fn main() {
    // no client-side main function
    // unless we want this to work with e.g., Trunk for pure client-side testing
    // see lib.rs for hydration function instead
}
