use crate::server::oidc::Authorizer;
use actix_session::Session;
use actix_web::{
    http::StatusCode,
    web::{Data, Redirect},
    *,
};
use aruna_web::utils::aruna_api_handlers::who_am_i;
use serde::Deserialize;
use std::sync::Mutex;

#[get("/login")]
pub async fn login(session: Session, data: Data<Mutex<Authorizer>>) -> Result<impl Responder> {
    let my_data = data
        .lock()
        .map_err(|_| error::InternalError::new("Poison", StatusCode::INTERNAL_SERVER_ERROR))?;

    let url = my_data.get_challenge(session).map_err(|_| {
        error::InternalError::new("GetChallenge", StatusCode::INTERNAL_SERVER_ERROR)
    })?;

    Ok(Redirect::to(url.to_string()).see_other())
}

#[get("/logout")]
pub async fn logout(session: Session, data: Data<Mutex<Authorizer>>) -> Result<impl Responder> {
    let my_data = data
        .lock()
        .map_err(|_| error::InternalError::new("Poison", StatusCode::INTERNAL_SERVER_ERROR))?;

    // TODO: REMOVE token from backend
    session.clear();

    Ok(Redirect::to(format!(
        "{}/{}",
        my_data.get_keycloak_url(),
        "protocol/openid-connect/logout?redirect_uri=https%3A%2F%2Faruna-storage.org"
    ))
    .see_other())
}

#[derive(Debug, Deserialize)]
pub struct Params {
    pub state: String,
    pub session_state: String,
    pub code: String,
}

#[get("/callback")]
pub async fn callback(
    req: HttpRequest,
    session: Session,
    data: Data<Mutex<Authorizer>>,
) -> Result<impl Responder> {
    let query_params = web::Query::<Params>::from_query(req.query_string())?;

    let my_data = data
        .lock()
        .map_err(|_| error::InternalError::new("Poison", StatusCode::INTERNAL_SERVER_ERROR))?;

    let token = my_data
        .exchange_challenge(&session, &query_params.code, &query_params.state)
        .await
        .map_err(|e| {
            error::InternalError::new(
                format!("Unable to exchange OIDC code {e}"),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    //Check who the user is and potentially exchange for "real" API-Token token
    match who_am_i(&token).await {
        Ok(val) => {
            session.insert("user_info", val)?;
            return Ok(Redirect::to("/panel").see_other());
        }
        Err(e) => {
            if e.to_string().contains("not activated") {
                return Ok(Redirect::to("/activate").see_other());
            } else if e.to_string().contains("Not registered") {
                return Ok(Redirect::to("/register").see_other());
            } else {
                return Ok(Redirect::to("/error").see_other());
            };
        }
    }
}

#[get("/oidc-callback")]
pub async fn oidccallback(
    req: HttpRequest,
    session: Session,
    data: Data<Mutex<Authorizer>>,
) -> Result<impl Responder> {
    let query_params = web::Query::<Params>::from_query(req.query_string())?;

    let my_data = data
        .lock()
        .map_err(|_| error::InternalError::new("Poison", StatusCode::INTERNAL_SERVER_ERROR))?;

    let token = my_data
        .exchange_challenge(&session, &query_params.code, &query_params.state)
        .await
        .map_err(|e| {
            error::InternalError::new(
                format!("Unable to exchange OIDC code {e}"),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    //Check who the user is and potentially exchange for "real" API-Token token
    match who_am_i(&token).await {
        Ok(val) => {
            session.insert("user_info", val)?;
            return Ok(Redirect::to("/panel").see_other());
        }
        Err(e) => {
            if e.to_string().contains("not activated") {
                return Ok(Redirect::to("/activate").see_other());
            } else if e.to_string().contains("Not registered") {
                return Ok(Redirect::to("/register").see_other());
            } else {
                return Ok(Redirect::to("/error").see_other());
            };
        }
    }
}
