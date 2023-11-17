use anyhow::anyhow;
use anyhow::Result;
use openidconnect::core::{CoreAuthenticationFlow, CoreClient, CoreProviderMetadata};
use openidconnect::reqwest::async_http_client;
use openidconnect::OAuth2TokenResponse;
use openidconnect::PkceCodeVerifier;
use openidconnect::RefreshToken;
use openidconnect::{
    AuthorizationCode, ClientId, ClientSecret, CsrfToken, IssuerUrl, Nonce,
    PkceCodeChallenge, RedirectUrl,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use url::Url;

#[derive(Clone)]
pub struct Authorizer {
    pub authorizer_name: String,
    core_client: CoreClient,
    key_cloak_url: Url,
}

#[derive(Serialize, Deserialize)]
pub struct Challenge {
    pub authorizer_name: String,
    pub csrf_token: CsrfToken,
    pub nonce: Nonce,
    pub pkce_verifier: PkceCodeVerifier,
    pub redirect_url: String,
}

impl Challenge {
    pub fn new(
        csrf_token: CsrfToken,
        nonce: Nonce,
        pkce_verifier: PkceCodeVerifier,
        redirect_url: String,
        authorizer_name: String,
    ) -> Self {
        Challenge {
            authorizer_name,
            csrf_token,
            nonce,
            pkce_verifier,
            redirect_url,
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
    pub async fn new(
        name: String,
        url: String,
        client: String,
        secret: String,
        callback: String,
    ) -> Result<Self> {
        let provider_metadata =
            CoreProviderMetadata::discover_async(IssuerUrl::new(url.clone())?, async_http_client)
                .await?;

        // Create an OpenID Connect client by specifying the client ID, client secret, authorization URL
        // and token URL.
        let client = CoreClient::from_provider_metadata(
            provider_metadata,
            ClientId::new(client),
            Some(ClientSecret::new(secret)),
        )
        // Set the URL the user will be redirected to after the authorization process.
        .set_redirect_uri(RedirectUrl::new(callback)?);

        Ok(Authorizer {
            authorizer_name: name,
            core_client: client,
            key_cloak_url: url::Url::parse(&url).unwrap(),
        })
    }

    pub fn get_keycloak_url(&self) -> String {
        self.key_cloak_url.to_string()
    }

    pub fn get_challenge(&self, redirect_url: String) -> Result<(Challenge, url::Url)> {
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
            // Set the PKCE code challenge.
            .set_pkce_challenge(pkce_challenge)
            .url();

        Ok((
            Challenge::new(
                csrf_token,
                nonce,
                pkce_verifier,
                redirect_url,
                self.authorizer_name.to_string(),
            ),
            auth_url,
        ))
    }

    /// Exchange the temp token for a "real one"
    pub async fn exchange_challenge(
        &self,
        challenge: Challenge,
        auth_code: &str,
        state: &str,
    ) -> Result<(String, Duration, String)> {
        // Once the user has been redirected to the redirect URL, you'll have access to the
        // authorization code. For security reasons, your code should verify that the `state`
        // parameter returned by the server matches `csrf_state`.
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

        let expires = token_response.expires_in().unwrap_or_default();
        // Extract the ID token claims after verifying its authenticity and nonce.
        let access_token = token_response
            .access_token().secret().to_string();

        let refresh_token = token_response
            .refresh_token()
            .ok_or_else(|| anyhow!("Server did not return a refresh token"))?
            .clone();

        Ok((
            access_token,
            expires,
            refresh_token.secret().to_string(),
        ))
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<(String, Option<String>, Duration)> {
        let token = self
            .core_client
            .exchange_refresh_token(&RefreshToken::new(refresh_token.to_string()))
            .request_async(async_http_client)
            .await?;

        Ok((
            token.access_token().secret().to_string(),
            token.refresh_token().map(|r| r.secret().to_string()),
            token.expires_in().unwrap_or_default(),
        ))
    }
}
