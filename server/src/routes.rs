use std::{fmt, str::FromStr};

use crate::{oidc::Challenge, ServerState};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Redirect,
};
use axum_extra::extract::{cookie::Cookie, CookieJar};
use serde::{de, Deserialize, Deserializer};
use time::OffsetDateTime;

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

    let (token, expires, refresh) = state
        .oidc
        .exchange_challenge(challenge, &query.code, &query.state)
        .await
        .map_err(|e| {
            log::error!("Unable to exchange challenge: {}", e);
            StatusCode::UNAUTHORIZED
        })?;

    let expires = OffsetDateTime::now_utc() + expires;

    let token_cookie = Cookie::build("token", token.clone())
        .path("/")
        .secure(true)
        .http_only(true)
        .expires(expires)
        .finish();

    let refresh_cookie = Cookie::build("refresh", refresh.clone())
        .path("/")
        .secure(true)
        .http_only(true)
        .finish();

    let jar = jar
        .add(token_cookie)
        .add(refresh_cookie)
        .add(Cookie::new("logged_in", "true"));
    Ok((jar, Redirect::to("/")))
}

#[derive(serde::Deserialize)]
pub struct FromQuery {
    #[serde(default, deserialize_with = "empty_string_as_none")]
    pub from: Option<String>,
}

/// Serde deserialization decorator to map empty Strings to None,
fn empty_string_as_none<'de, D, T>(de: D) -> Result<Option<T>, D::Error>
where
    D: Deserializer<'de>,
    T: FromStr,
    T::Err: fmt::Display,
{
    let opt = Option::<String>::deserialize(de)?;
    match opt.as_deref() {
        None | Some("") => Ok(None),
        Some(s) => FromStr::from_str(s).map_err(de::Error::custom).map(Some),
    }
}

pub async fn refresh(
    State(state): State<ServerState>,
    jar: CookieJar,
    Query(query): Query<FromQuery>,
) -> Result<(CookieJar, Redirect), StatusCode> {
    let challenge = jar.get("refresh").ok_or(StatusCode::UNAUTHORIZED)?;

    let (new_token, expires) = state.oidc.refresh(challenge.value()).await;
    let expires = OffsetDateTime::now_utc() + expires;

    let token_cookie = Cookie::build("token", new_token.clone())
        .path("/")
        .secure(true)
        .http_only(true)
        .expires(expires)
        .finish();

    let jar = jar.add(token_cookie).add(Cookie::new("logged_in", "true"));
    Ok((jar, Redirect::to(&query.from.unwrap_or("/".to_string()))))
}
