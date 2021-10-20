import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { CreateProjectComponent } from '../dialogs/create-project/create-project.component';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-project-overview',
  templateUrl: './project-overview.component.html',
  styleUrls: ['./project-overview.component.scss']
})
export class ProjectOverviewComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  dataset_table: any
  user_id =""
  displayedColumns: string[]
  dummy= [
    {id: "001", name: "dyinglight", datatype: "story"},
    {id: "002", name: "bf2042", datatype: "fps"}

  ]

  constructor(
    private router: Router,
    public dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.displayedColumns=["id", "name", "datatype", "delete"]
    this.dataset_table = new MatTableDataSource(this.dummy)
   }

  ngOnInit(): void {
  }

  goBack(){
    this.router.navigate(["/home"])
  }
  ngAfterViewInit():void{
    this.dataset_table.sort = this.sort
  }
  deleteDataset(name, id){
    console.log("Deleting Dataset ", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Dataset?",
        button: "Delete Dataset",
        message: "Are you sure you want to delete  '"+ name + "' (ID: "+id+")?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataset_table.filter = filterValue.trim().toLowerCase();
  }

  newDataset(){
    console.log("Generating dataset...")
    const dialogRef = this.dialog.open(CreateProjectComponent, { 
      data: {type: "Dataset"},
      hasBackdrop:true
       })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  addUser(){
    if (this.user_id != ""){
    console.log("Adding User "+this.user_id+" to project.")
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Add User to Project?",
        button: "Add User",
        message: "Are you sure you want to add user '" + this.user_id + "' to project_name?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
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
