use crate::server::oidc::Authorizer;
use actix_session::Session;
use actix_web::{
    http::StatusCode,
    web::{Data, Redirect},
    *,
};
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
