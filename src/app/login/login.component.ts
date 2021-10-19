import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {

  constructor(private authService: AuthService, private router: Router) { }

  ngOnInit(): void {
    console.log("trying login")
    this.authService.tryLogin()
  }


  login(){
    this.authService.startAuthorization()

  }
  toHome(){
    this.router.navigate(["/home"])
  }
}
