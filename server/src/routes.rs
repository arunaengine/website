use std::{fmt, mem, str::FromStr};

use crate::ServerState;
use aruna_web_app::utils::oidc::Challenge;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Redirect,
};
use axum_extra::extract::{cookie::Cookie, PrivateCookieJar};
use serde::{de, Deserialize, Deserializer};
use time::OffsetDateTime;

#[derive(Deserialize)]
pub struct LoginQuery {
    pub oidc: String,
    pub redirect: Option<String>,
}

pub async fn login(
    State(state): State<ServerState>,
    Query(querydata): Query<LoginQuery>,
    jar: PrivateCookieJar,
) -> Result<(PrivateCookieJar, Redirect), StatusCode> {
    let redirect = urlencoding::decode(&querydata.redirect.unwrap_or_else(|| "/".to_string()))
        .map(|e| e.into_owned())
        .unwrap_or_else(|_| "/".to_string());

    let oidc = match state.get_oidc(&querydata.oidc) {
        Some(oidc) => oidc,
        None => return Err(StatusCode::NOT_FOUND),
    };

    if let Some(refresh_token) = jar.get("refresh") {
        if let Ok((token, duration)) = oidc.refresh(refresh_token.value()).await {
            let expires = OffsetDateTime::now_utc() + duration;
            let token_cookie = Cookie::build("token", token.clone())
                .path("/")
                .secure(true)
                .http_only(true)
                .expires(expires)
                .finish();

            let jar = jar.add(token_cookie).add(Cookie::new("logged_in", "true"));
            return Ok((jar, Redirect::to(&redirect)));
        }
    }

    if let Ok((c, url)) = oidc.get_challenge(redirect) {
        let cookie = Cookie::build("challenge", serde_json::to_string(&c).unwrap())
            .path("/")
            .secure(true)
            .http_only(true)
            .finish();

        let provider_cookie = Cookie::build("provider", oidc.authorizer_name.clone())
            .path("/")
            .secure(true)
            .http_only(true)
            .finish();

        Ok((
            jar.add(cookie).add(provider_cookie),
            Redirect::to(url.as_str()),
        ))
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
    jar: PrivateCookieJar,
    Query(query): Query<QueryData>,
) -> Result<(PrivateCookieJar, Redirect), StatusCode> {
    let challenge = jar.get("challenge").ok_or(StatusCode::UNAUTHORIZED)?;
    let mut challenge: Challenge =
        serde_json::from_str(challenge.value()).map_err(|_| StatusCode::UNAUTHORIZED)?;

    let redirect = mem::take(&mut challenge.redirect_url);
    let jar = jar.remove(Cookie::named("challenge"));

    let oidc = match state.get_oidc(&challenge.authorizer_name) {
        Some(oidc) => oidc,
        None => return Err(StatusCode::NOT_FOUND),
    };

    let (token, expires, refresh) = oidc
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
    Ok((jar, Redirect::to(&redirect)))
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
    jar: PrivateCookieJar,
    Query(query): Query<FromQuery>,
) -> Result<(PrivateCookieJar, Redirect), StatusCode> {
    let challenge = jar.get("refresh").ok_or_else(|| StatusCode::UNAUTHORIZED)?;
    let provider = jar.get("provider").ok_or_else(|| StatusCode::NOT_FOUND)?;

    let oidc = state
        .get_oidc(provider.value())
        .ok_or_else(|| StatusCode::NOT_FOUND)?;

    let (new_token, expires) = oidc
        .refresh(challenge.value())
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
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

pub async fn logout(
    State(_state): State<ServerState>,
    mut jar: PrivateCookieJar,
) -> Result<(PrivateCookieJar, Redirect), StatusCode> {
    let old_jar = jar.clone();

    for c in old_jar.iter() {
        jar = jar.remove(c.clone());
    }

    Ok((jar, Redirect::to("/")))
}
