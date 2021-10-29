import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { CreateProjectComponent } from '../dialogs/create-project/create-project.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginator } from '@angular/material/paginator';
import { ApiService } from '../services/api.service';
import { DetailsDialogComponent } from '../dialogs/details-dialog/details-dialog.component';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';
import { AuthService } from '../services/auth.service';
import { LoadingComponent } from '../dialogs/loading/loading.component';

@Component({
  selector: 'app-project-overview',
  templateUrl: './project-overview.component.html',
  styleUrls: ['./project-overview.component.scss']
})
export class ProjectOverviewComponent implements OnInit {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort:MatSort

  dataset_table: any
  user_id =""
  displayedColumns: string[]


  constructor(
    private router: Router,
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService,
    public authService: AuthService
  ) {
    console.log(this.apiService.project)
    this.displayedColumns=[ "name", "description", "created", "actions"]
    this.dataset_table = new MatTableDataSource(this.apiService.project.datasets)
   }

  ngOnInit(): void {
  }

  goBack(){
    this.router.navigate(["/home"])
  }
  ngAfterViewInit():void{
    this.dataset_table.paginator = this.paginator
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
        this.apiService.deleteDataset(id).then(()=> {
          this.refreshDatasets()
        })
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
        this.apiService.createDataset(result.name, result.description).then(()=> {
          this.refreshDatasets()})
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
  viewDetails(id){
    console.log("See Details...")
    
    this.apiService.getDetails(id).then(res => {
      const dialogRef = this.dialog.open(DetailsDialogComponent, {
        data: {
          details: res
        },
        hasBackdrop: true
      })
    })
  }

  viewVersion(id){
    console.log("See versions...")
    //this.apiService.viewDatasetVersion(id)
  }

  toObjectGroups(element){
    
    const dialogRef = this.dialog.open(LoadingComponent, {
      hasBackdrop: true,
      disableClose: true
    })
    
    console.log("See ObjectGroups..." + element)
    this.apiService.viewObjectGroups(element).then(()=> {
      dialogRef.close()
      this.router.navigate(["/groups"])
    })
    
  }

 async refreshDatasets(){
  await this.apiService.viewSingleProject(this.apiService.project.project["id"])
  await this.apiService.getDatasetsforProject(this.apiService.project.project["id"])
      this.dataset_table = new MatTableDataSource(this.apiService.project.datasets)
      this.dataset_table.paginator = this.paginator
      this.dataset_table.sort = this.sort
  }

  openProfile(){
    const dialogRef = this.dialog.open(ProfileDialogComponent, {
      position: {right: "10px", top: "10px"},
      hasBackdrop: true
    })
  }
  openSnackBar(){
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
}
