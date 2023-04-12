use aruna_rust_api::api::storage::services::v1::{CreateApiTokenRequest, ExpiresAt};
use chrono::{Datelike, Days, Months, NaiveDate, Timelike, Utc};

pub fn to_create_token_req(
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: String,
    selectexpiry: String,
    customdate: Option<String>,
) -> CreateApiTokenRequest {
    let (col_id, proj_id) = match selecttype.as_str() {
        "1" => (resid.unwrap_or_default(), "".to_string()),
        "2" => ("".to_string(), resid.unwrap_or_default()),
        _ => ("".to_string(), "".to_string()),
    };

    let now = Utc::now().naive_utc();
    let expires = match selectexpiry.as_str() {
        "0" => now + Months::new(12 * 10), // Never == 10 years
        "1" => now + Days::new(1),         // 1 Day
        "2" => now + Days::new(7),         // 7 Days
        "3" => now + Days::new(30),        // 30 Days
        "4" => now + Days::new(365),       // 365 Days
        _ => match customdate {
            Some(d) => {
                let date = NaiveDate::parse_from_str(&d, "%Y-%m-%d").unwrap_or_default();
                let dur = date.signed_duration_since(now.date());
                now + dur
            }
            None => now + Days::new(1),
        },
    };

    let permission = match selectperm.as_str() {
        "NONE" => 1,
        "READ" => 2,
        "APPEND" => 3,
        "MODIFY" => 4,
        "ADMIN" => 5,
        _ => 1,
    };

    CreateApiTokenRequest {
        project_id: proj_id,
        collection_id: col_id,
        name: tokenname,
        expires_at: Some(ExpiresAt {
            timestamp: Some(
                prost_types::Timestamp::date_time(
                    expires.date().year().into(),
                    expires.date().month() as u8,
                    expires.date().day() as u8,
                    expires.time().hour() as u8,
                    expires.time().minute() as u8,
                    expires.time().second() as u8,
                )
                .unwrap(),
            ),
        }),
        permission,
        is_session: false,
    }
}
