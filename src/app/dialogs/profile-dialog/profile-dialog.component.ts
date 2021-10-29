import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from 'src/app/services/api.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-profile-dialog',
  templateUrl: './profile-dialog.component.html',
  styleUrls: ['./profile-dialog.component.scss']
})
export class ProfileDialogComponent implements OnInit {
  groups= []
  constructor(public authService: AuthService, private snackBar:MatSnackBar) {
    for (let group of this.authService.user_data.groups){
      this.groups.push(group.substring(1)) 
    }
   }

  ngOnInit(): void {
    console.log(this.authService.user_data)
  }

  logout(){
    this.authService.logout()

  }
  openSnackBar(){
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
}
