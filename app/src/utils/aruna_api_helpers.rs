use aruna_rust_api::api::storage::models::v2::{Permission, permission};
use aruna_rust_api::api::storage::services::v2::CreateApiTokenRequest;
use chrono::{Days, Months, NaiveDate, Utc};
use prost_wkt_types::Timestamp;
use anyhow::Result;
use anyhow::anyhow;

pub fn to_create_token_req(
    tokenname: String,
    selecttype: String,
    resid: Option<String>,
    selectperm: Option<String>,
    selectexpiry: String,
    customdate: Option<String>,
) -> Result<CreateApiTokenRequest> {


    let resource = match selecttype.as_str() {
        "project" => Some(permission::ResourceId::ProjectId(resid.ok_or_else(|| anyhow!("No resource id provided for project token"))?)),
        "collection" => Some(permission::ResourceId::CollectionId(resid.ok_or_else(|| anyhow!("No resource id provided for project token"))?)),
        "dataset" => Some(permission::ResourceId::DatasetId(resid.ok_or_else(|| anyhow!("No resource id provided for project token"))?)),
        "object" => Some(permission::ResourceId::ObjectId(resid.ok_or_else(|| anyhow!("No resource id provided for project token"))?)),
        _ => None,
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

    let perm = resource.map(|r| Permission {
        permission_level,
        resource_id: Some(r),
    });

    Ok(CreateApiTokenRequest {
        name: tokenname,
        expires_at: Some(Timestamp::from(expires)),
        permission: perm,
    })
}