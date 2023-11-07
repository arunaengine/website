use leptos::*;
use anyhow::anyhow;
use anyhow::Result;
use axum_core::response::IntoResponse;
use axum_extra::extract::cookie::Cookie;
use axum_extra::extract::cookie::Key;
use axum_extra::extract::PrivateCookieJar;
use leptos_axum::ResponseOptions;
use leptos_axum::ResponseParts;
use crate::utils::oidc::Authorizer;

pub fn extract_token() -> Result<String> {

    let req_parts = use_context::<leptos_axum::RequestParts>()
    .ok_or_else(|| anyhow!("Unknown context"))?;

    let oidc_handler = use_context::<Authorizer>().ok_or_else(|| anyhow!("Unknown context"))?;

    let signing_key: Key =
        use_context::<Key>().ok_or_else(|| anyhow!("Unknown context"))?;
    let jar = PrivateCookieJar::from_headers(&req_parts.headers, signing_key);

    match jar.get("logged_in") {
        Some(l) if l.value() == "false" => return Err(anyhow!("Not logged in")),
        None => return Err(anyhow!("Not logged in")),
        _ => {}
    }

    let jar = jar.add(Cookie::new("whatever", "true"));

    let response = expect_context::<ResponseOptions>();

    let token = jar.get("token").map(|c| c.value().to_string()).ok_or_else(|| anyhow!("No token found"));

    response.overwrite(ResponseParts {
        headers: jar.into_response().into_parts().0.headers,
        ..Default::default()
    });

    token

}