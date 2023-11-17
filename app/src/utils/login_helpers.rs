use crate::utils::oidc::Authorizer;
use axum_core::response::IntoResponse;
use axum_extra::extract::cookie::Cookie;
use axum_extra::extract::cookie::Key;
use axum_extra::extract::PrivateCookieJar;
use axum_extra::extract::cookie::SameSite;
use leptos::*;
use leptos_axum::ResponseOptions;
use leptos_axum::ResponseParts;
use serde::Deserialize;
use serde::Serialize;
use time::OffsetDateTime;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub enum LoginResult {
    ValidToken(String),
    SessionExpired,
    NotLoggedIn,
    Error(String),
}

pub async fn extract_token() -> LoginResult {
    let Some(req_parts) = use_context::<leptos_axum::RequestParts>() else {
        return LoginResult::Error("Missing request parts".to_string());
    };

    let Some(oidc_handlers) = use_context::<Vec<(String, Authorizer)>>() else {
        return LoginResult::Error("Missing oidc handler".to_string());
    };

    let Some(signing_key) = use_context::<Key>() else {
        return LoginResult::Error("Missing signing key".to_string());
    };

    let Some(response) = use_context::<ResponseOptions>() else {
        return LoginResult::Error("Missing response options".to_string());
    };

    let mut jar = PrivateCookieJar::from_headers(&req_parts.headers, signing_key);



    if jar.get("logged_in") != Some(Cookie::new("logged_in", "true")) {
        leptos_axum::redirect("/");
        return LoginResult::NotLoggedIn;
    }

    if let Some(token) = jar.get("token") {
        return LoginResult::ValidToken(token.value().to_string());
    }

    if let Some(refresh_token) = jar.get("refresh") {
        let Some(provider) = jar.get("provider") else {
            return LoginResult::NotLoggedIn;
        };

        let Some(handler) = oidc_handlers
            .iter()
            .find(|(a, _)| a == provider.value())
            .map(|(_, oidc_handler)| oidc_handler)
        else {
            return LoginResult::Error("Missing oidc handler".to_string());
        };

        let (access_token, refresh_token, duration) = match handler.refresh(refresh_token.value()).await {
            Ok(token) => token,
            Err(e) => {
                return LoginResult::Error(format!("Error refreshing token: {}", e));
            }
        };

        let expires = OffsetDateTime::now_utc() + duration;
        let token_cookie = Cookie::build("token", access_token.clone())
            .path("/")
            .secure(true)
            .http_only(true)
            .expires(expires)
            .same_site(SameSite::Strict)
            .finish();

        if let Some(refresh_token) = refresh_token {
            let refresh_cookie = Cookie::build("refresh", refresh_token.clone())
                .path("/")
                .secure(true)
                .http_only(true)
                .same_site(SameSite::Strict)
                .finish();

            jar = jar.add(refresh_cookie);
        }

        jar = jar.add(token_cookie).add(Cookie::new("logged_in", "true"));

        response.overwrite(ResponseParts {
            headers: jar.into_response().into_parts().0.headers,
            ..Default::default()
        });

        return LoginResult::ValidToken(access_token);
    }

    // Remove all cookies (Not logged / broken refresh)
    let jarcopy = jar.clone();
    for c in jarcopy.iter() {
        jar = jar.remove(c);
    }

    response.overwrite(ResponseParts {
        headers: jar.into_response().into_parts().0.headers,
        ..Default::default()
    });

    leptos_axum::redirect("/");

    LoginResult::NotLoggedIn
}
