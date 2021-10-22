import { Injectable } from '@angular/core';
import { AuthConfig } from 'angular-oauth2-oidc';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  auth_config: AuthConfig 
  constructor() { }
}
