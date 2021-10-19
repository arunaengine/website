import { Injectable } from '@angular/core';
import { AuthConfig, OAuthService  } from 'angular-oauth2-oidc';
import { JwksValidationHandler } from 'angular-oauth2-oidc-jwks';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  authCodeFlowConfig: AuthConfig = {
    issuer: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity",
    loginUrl: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity/protocol/openid-connect/auth",
    logoutUrl: "https://keycloak.m1.k8s.computational.bio/auth/realms/NFDI4Biodiversity/protocol/openid-connect/logout",
    requestAccessToken: true,
    clientId: "website-angular-local",
    redirectUri: window.location.origin + "/auth-callback",
    scope: "openid profile email",
    showDebugInformation: true,
  }

  user_data: any

  constructor(
    private oauthService: OAuthService,
    ) {
      

   }

   configueImplicitFlowAuthentication(){
    this.oauthService.configure(this.authCodeFlowConfig)
    this.oauthService.tokenValidationHandler = new JwksValidationHandler()
    this.oauthService.loadDiscoveryDocument().then(doc => {
      console.log(doc)
      this.oauthService.tryLogin().catch(err => {
        console.log("Error while Login", err)
      }).then((res) => {
        console.log("trylogin",res)
        if (!this.oauthService.hasValidAccessToken()){
          console.log("no login")
          this.oauthService.initImplicitFlow()
        }
      })
    })
   }

   startAuthorization(){
    console.log("hey")
    this.configueImplicitFlowAuthentication()
   }

  
}
