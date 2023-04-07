use crate::server::{aruna_api_handlers::who_am_i, oidc::Authorizer};
use actix_session::Session;
use actix_web::{
    http::StatusCode,
    web::{Data, Redirect},
    *,
};
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

    let _token = my_data
        .exchange_challenge(session, &query_params.code, &query_params.state)
        .await
        .map_err(|_| {
            error::InternalError::new(
                "Unable to exchange OIDC code",
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        })?;

    // Check who the user is and potentioally exchange for "real" API-Token token
    // who_am_i(&token).await.map_err(|_| {
    //     error::InternalError::new("ArunaAPI error", StatusCode::INTERNAL_SERVER_ERROR)
    // })?;

    Ok(Redirect::to("/register").see_other())
}
