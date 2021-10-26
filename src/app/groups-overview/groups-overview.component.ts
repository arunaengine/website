import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CreateObjgroupComponent } from '../dialogs/create-objgroup/create-objgroup.component';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';

@Component({
  selector: 'app-groups-overview',
  templateUrl: './groups-overview.component.html',
  styleUrls: ['./groups-overview.component.scss']
})
export class GroupsOverviewComponent implements OnInit {
  
  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
  }

  goBack(){
    this.router.navigate(["/project_overview"])
  }
  openProfile(){
    const dialogRef = this.dialog.open(ProfileDialogComponent, {
      position: {right: "10px", top: "10px"},
      hasBackdrop: true
    })
  }

  newObjectgroup(){
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {hasBackdrop: true}
      )
  }
  openSnackBar(){
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
}
