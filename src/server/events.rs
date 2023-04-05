use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Event {
    pub recipient: String,
    pub resource_id: String,
    pub resource_type: String,
}
