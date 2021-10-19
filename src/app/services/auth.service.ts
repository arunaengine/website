import { Injectable } from '@angular/core';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { JwksValidationHandler } from 'angular-oauth2-oidc-jwks';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  authCodeFlowConfig: AuthConfig = {
    issuer: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity",
    loginUrl: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity/protocol/openid-connect/auth",
    clientId: "website-angular-local",
    redirectUri: "http://localhost:4200/auth-callback",
    responseType: "code",
    scope: "openid profile email",
    showDebugInformation: true,
  }

  user_data: any

  constructor(
    private oauthService: OAuthService,
    ) {
      
      this.configueAuthentication()
   }

   configueAuthentication(){
     console.log("creating config...")
    this.oauthService.configure(this.authCodeFlowConfig)
    this.oauthService.tokenValidationHandler = new JwksValidationHandler()
    this.oauthService.loadDiscoveryDocumentAndTryLogin()
   }

   startAuthorization(){
    console.log("logging in...")
    if (!this.oauthService.hasValidAccessToken()){
          this.oauthService.initLoginFlow()
    }
   }

  
}
