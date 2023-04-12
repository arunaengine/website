use anyhow::anyhow;
use anyhow::Result;
use openidconnect::core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata};
use openidconnect::PkceCodeVerifier;
use openidconnect::{
    AccessTokenHash, AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    PkceCodeChallenge, RedirectUrl, Scope,
};

use actix_session::Session;
use openidconnect::reqwest::async_http_client;
use serde::{Deserialize, Serialize};
pub struct Authorizer {
    core_client: CoreClient,
}

#[derive(Serialize, Deserialize)]
pub struct Challenge {
    pub csrf_token: CsrfToken,
    pub nonce: Nonce,
    pub pkce_verifier: PkceCodeVerifier,
}

impl Challenge {
    pub fn new(csrf_token: CsrfToken, nonce: Nonce, pkce_verifier: PkceCodeVerifier) -> Self {
        Challenge {
            csrf_token,
            nonce,
            pkce_verifier,
        }
    }

    pub fn check_state(&self, expected_state: &str) -> Result<()> {
        if self.csrf_token.secret() == expected_state {
            Ok(())
        } else {
            Err(anyhow!("CSRF detected: Invalid state"))
        }
    }

    pub fn get_nonce(&self) -> &Nonce {
        &self.nonce
    }

    pub fn get_verifier(&self) -> PkceCodeVerifier {
        PkceCodeVerifier::new(self.pkce_verifier.secret().to_string())
    }
}

impl Authorizer {
    pub async fn new() -> Result<Self> {
        let provider_metadata = CoreProviderMetadata::discover_async(
            IssuerUrl::new("http://localhost:1998/realms/test".to_string())?,
            async_http_client,
        )
        .await?;

        // Create an OpenID Connect client by specifying the client ID, client secret, authorization URL
        // and token URL.
        let client = CoreClient::from_provider_metadata(
            provider_metadata,
            ClientId::new("test".to_string()),
            Some(ClientSecret::new(
                "Ns46QiaYHq8MnPKTo1R8NXkU3VDixdIY".to_string(),
            )),
        )
        // Set the URL the user will be redirected to after the authorization process.
        .set_redirect_uri(RedirectUrl::new(
            "http://localhost:3000/callback".to_string(),
        )?);

        Ok(Authorizer {
            core_client: client,
        })
    }

    pub fn get_challenge(&self, session: Session) -> Result<url::Url> {
        // Generate a PKCE challenge.
        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        // Generate the full authorization URL.
        let (auth_url, csrf_token, nonce) = self
            .core_client
            .authorize_url(
                CoreAuthenticationFlow::AuthorizationCode,
                CsrfToken::new_random,
                Nonce::new_random,
            ) // Set the desired scopes.
            .add_scope(Scope::new("email".to_string()))
            // Set the PKCE code challenge.
            .set_pkce_challenge(pkce_challenge)
            .url();

        session.insert(
            "challenge",
            Challenge::new(csrf_token, nonce, pkce_verifier),
        )?;

        Ok(auth_url)
    }

    /// Exchange the temp token for a "real one"
    pub async fn exchange_challenge(
        &self,
        session: &Session,
        auth_code: &str,
        state: &str,
    ) -> Result<String> {
        // Once the user has been redirected to the redirect URL, you'll have access to the
        // authorization code. For security reasons, your code should verify that the `state`
        // parameter returned by the server matches `csrf_state`.

        use openidconnect::{OAuth2TokenResponse, TokenResponse};

        let challenge = session
            .remove_as::<Challenge>("challenge")
            .ok_or_else(|| anyhow!("Unable to get challenge"))?
            .map_err(|_| anyhow!("Unable to decode session"))?;

        if challenge.csrf_token.secret() != state {
            return Err(anyhow!("Invalid state, csrf detected"));
        }

        // Now you can exchange it for an access token and ID token.
        let token_response = self
            .core_client
            .exchange_code(AuthorizationCode::new(auth_code.to_string()))
            // Set the PKCE code verifier.
            .set_pkce_verifier(challenge.get_verifier())
            .request_async(async_http_client)
            .await?;

        // Extract the ID token claims after verifying its authenticity and nonce.
        let id_token = token_response
            .id_token()
            .ok_or_else(|| anyhow!("Server did not return an ID token"))?;
        let claims =
            id_token.claims(&self.core_client.id_token_verifier(), challenge.get_nonce())?;

        // Verify the access token hash to ensure that the access token hasn't been substituted for
        // another user's.
        if let Some(expected_access_token_hash) = claims.access_token_hash() {
            let actual_access_token_hash = AccessTokenHash::from_token(
                token_response.access_token(),
                &id_token.signing_alg()?,
            )?;
            if actual_access_token_hash != *expected_access_token_hash {
                return Err(anyhow!("Invalid access token"));
            }
        }

        let token = id_token.to_string();

        session.insert("token", token.to_string())?;
        session.insert("token-type", "oidc".to_string())?;

        Ok(token)
    }
}
