import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';
import { OAuthService } from 'angular-oauth2-oidc';

@Injectable({
  providedIn: 'root'
})
export class AuthGuardService implements CanActivate {

  constructor(private oauthService: OAuthService) { }

  canActivate(): boolean {
    console.log("can activate?")
    //console.log(this.oauthService.getIdToken())
    if (this.oauthService.hasValidAccessToken()){
      console.log(true)
      return true
    } else {
      console.log(false)
      return false
    }
  }
}
