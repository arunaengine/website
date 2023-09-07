use crate::{oidc::Challenge, ServerState};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Redirect,
};
use axum_extra::extract::{cookie::Cookie, CookieJar};

pub async fn login(
    State(state): State<ServerState>,
    jar: CookieJar,
) -> Result<(CookieJar, Redirect), StatusCode> {
    if let Ok((c, url)) = state.oidc.get_challenge() {
        let cookie = Cookie::build("challenge", serde_json::to_string(&c).unwrap())
            .path("/")
            .secure(true)
            .http_only(true)
            .finish();

        Ok((jar.add(cookie), Redirect::to(url.as_str())))
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

#[derive(serde::Deserialize)]
pub struct QueryData {
    pub code: String,
    pub state: String,
}

pub async fn callback(
    State(state): State<ServerState>,
    jar: CookieJar,
    Query(query): Query<QueryData>,
) -> Result<(CookieJar, Redirect), StatusCode> {
    let challenge = jar.get("challenge").ok_or(StatusCode::UNAUTHORIZED)?;
    let challenge: Challenge =
        serde_json::from_str(challenge.value()).map_err(|_| StatusCode::UNAUTHORIZED)?;

    let jar = jar.remove(Cookie::named("challenge"));

    let token = state
        .oidc
        .exchange_challenge(challenge, &query.code, &query.state)
        .await
        .map_err(|e| {
            log::error!("Unable to exchange challenge: {}", e);
            StatusCode::UNAUTHORIZED
        })?;

    let cookie = Cookie::build("token", token.clone())
        .path("/")
        .secure(true)
        .http_only(true)
        .finish();

    Ok((jar.add(cookie), Redirect::to("/")))
}
