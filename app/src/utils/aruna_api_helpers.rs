use aruna_rust_api::api::storage::services::v2::{CreateApiTokenRequest, ExpiresAt};
use chrono::{Datelike, Days, Months, NaiveDate, Timelike, Utc};
use rand::{distributions::Alphanumeric, thread_rng, Rng};

pub fn to_create_token_req(
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: Option<String>,
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

    let permission = match selectperm {
        Some(perm) => match perm.as_str() {
            "NONE" => 1,
            "READ" => 2,
            "APPEND" => 3,
            "MODIFY" => 4,
            "ADMIN" => 5,
            _ => 1,
        },
        None => 1,
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

pub fn new_session_req() -> CreateApiTokenRequest {
    let chrono_time = Utc::now().naive_utc() + Days::new(7);
    CreateApiTokenRequest {
        project_id: "".to_string(),
        collection_id: "".to_string(),
        name: format!(
            "SESSION-{}",
            thread_rng()
                .sample_iter(&Alphanumeric)
                .take(8)
                .map(char::from)
                .collect::<String>()
        ),
        expires_at: Some(ExpiresAt {
            timestamp: Some(
                prost_types::Timestamp::date_time(
                    chrono_time.date().year().into(),
                    chrono_time.date().month() as u8,
                    chrono_time.date().day() as u8,
                    chrono_time.time().hour() as u8,
                    chrono_time.time().minute() as u8,
                    chrono_time.time().second() as u8,
                )
                .unwrap(),
            ),
        }),
        permission: 1, // Does not matter -> Personal
        is_session: true,
    }
}
