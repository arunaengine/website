use aruna_rust_api::api::storage::models::v2::Permission;
use aruna_rust_api::api::storage::services::v2::CreateApiTokenRequest;
use chrono::{Days, Months, NaiveDate, Utc};
use prost_wkt_types::Timestamp;

pub fn to_create_token_req(
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: Option<String>,
    selectexpiry: String,
    customdate: Option<String>,
) -> CreateApiTokenRequest {


    let resource = match selecttype.as_str() {
        "1" =>
    }
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

    let permission_level = match selectperm {
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

    let perm = Permission {
        permission_level,
        resource_id: Some(),
    };

    CreateApiTokenRequest {
        name: tokenname,
        expires_at: Some(Timestamp::from(expires)),
        permission: Some(perm),
    }
}