import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthConfig, OAuthService, OAuthErrorEvent } from 'angular-oauth2-oidc';
import { JwksValidationHandler } from 'angular-oauth2-oidc-jwks';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  /*
  dummy config thats working working
  // Url of the Identity Provider
  issuer: 'https://steyer-identity-server.azurewebsites.net/identity',

  // URL of the SPA to redirect the user to after login
  redirectUri: window.location.origin + '/index.html',

  // The SPA's id. The SPA is registerd with this id at the auth-server
  clientId: 'spa-demo',

  // set the scope for the permissions the client should request
  // The first three are defined by OIDC. The 4th is a usecase-specific one
  scope: 'openid profile email voucher',
  */

  authCodeFlowConfig: AuthConfig = {
    issuer: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity",
    loginUrl: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity/protocol/openid-connect/auth",
    clientId: "website-angular-local",
    redirectUri: "http://localhost:4200/auth-callback",
    responseType: "code",
    scope: "openid profile email",
    showDebugInformation: true,
    oidc: true

  }

  public user_data: any

  constructor(
    private oauthService: OAuthService,
    private router: Router
  ) {



    this.configueAuthentication()
  }

  configueAuthentication() {
    this.oauthService.events.subscribe(event => {
      if (event instanceof OAuthErrorEvent) {
        console.error(event);
      } else {
        console.warn(event);
      }
    });
    console.log("creating config and try login...")
    this.oauthService.configure(this.authCodeFlowConfig)
    this.oauthService.tokenValidationHandler = new JwksValidationHandler()
    this.oauthService.loadDiscoveryDocumentAndTryLogin().then(() => {
      console.log("getting user in config")
      if (this.isUser()) {
        this.router.navigate(["/home"])
      }

    })
  }

  startAuthorization() {
    console.log("logging in...")
    if (!this.oauthService.hasValidAccessToken()) {
      this.oauthService.initLoginFlow()
      this.isUser()
    }
  }

  isUser(): boolean {
    console.log("Is User?...")
    console.log(this.oauthService.hasValidAccessToken())
    if (this.oauthService.hasValidAccessToken()) {
      this.user_data = this.oauthService.getIdentityClaims()
      return true
    } else {
      return false
    }

  }

  tryLogin() {
    this.oauthService.tryLogin()
  }

  logout() {
    this.oauthService.revokeTokenAndLogout()
  }
}
