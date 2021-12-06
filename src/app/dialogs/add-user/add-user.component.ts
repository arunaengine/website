import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from 'src/app/services/api.service';
import { AlertDialogComponent } from '../alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-add-user',
  templateUrl: './add-user.component.html',
  styleUrls: ['./add-user.component.scss']
})
export class AddUserComponent implements OnInit {
  user_id = ""
  constructor(private apiService: ApiService, private dialog: MatDialog, private snackBar: MatSnackBar) { }

  ngOnInit(): void {
  }

  addUser(){
    if (this.user_id != ""){
    console.log("Adding User "+this.user_id+" to project.")
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Add User to Project?",
        button: "Add User",
        message: "Are you sure you want to add user '" + this.user_id + "' to "+ this.apiService.project.project["name"]+"?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.addUsertoProject(this.user_id)
      } else {
        console.log("Dialog dismissed")
      }
    })
  } else {
    this.snackBar.open("Please enter valid user ID!","",{
      duration: 3000,
      panelClass: ["warning-snackbar"]
    })
  }
  }
}
