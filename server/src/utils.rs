use anyhow::Result;
use aruna_web_app::utils::oidc::Authorizer;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    oidc_provider: Vec<KeyCloakConfig>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KeyCloakConfig {
    name: String,
    discovery_url: String,
    client_id: String,
    client_secret: String,
    callback_url: String,
}

impl Config {
    pub async fn into_authorizers(self) -> Result<Vec<(String, Authorizer)>> {
        let mut providers = vec![];
        for p in self.oidc_provider {
            let provider = (
                p.name.to_string(),
                Authorizer::new(
                    p.name,
                    p.discovery_url,
                    p.client_id,
                    p.client_secret,
                    p.callback_url,
                )
                .await?,
            );
            providers.push(provider);
        }
        Ok(providers)
    }
}
