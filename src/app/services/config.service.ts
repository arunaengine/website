import { Injectable } from '@angular/core';
import { AuthConfig } from 'angular-oauth2-oidc';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  auth_config: AuthConfig
  gateway_url: string
  swagger_ui: string
  api_url: string
  constructor() { }
}
