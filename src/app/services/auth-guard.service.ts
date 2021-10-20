import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuardService implements CanActivate {

  constructor(private authService: AuthService, private router: Router) { }

  canActivate(): boolean {
    console.log("can activate?")
    if (this.authService.isUser()){
          return true
    } else {
      this.router.navigate(["/login"])
      return false
    }
  }
}
