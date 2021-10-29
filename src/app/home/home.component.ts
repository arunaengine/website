import { Component, OnInit, ViewChild } from '@angular/core';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import {MatDialog} from '@angular/material/dialog';
import { CreateProjectComponent } from '../dialogs/create-project/create-project.component';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { ProjectTokensComponent } from '../dialogs/project-tokens/project-tokens.component';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  project_table: any
  displayedColumns: string[]

  constructor(
    public dialog: MatDialog,
    private router: Router,
    public authService: AuthService,
    public apiService: ApiService,
    private snackBar: MatSnackBar
  ) { 
    this.apiService.getProjects().then(()=> {
    
    this.project_table = new MatTableDataSource(this.apiService.projects)
    })
    
    this.project_table = new MatTableDataSource(this.apiService.projects)

    this.displayedColumns=["name", "description", "actions"]
    
    
    console.log(this.project_table)
  }

  ngOnInit(): void {

  }

  ngAfterViewInit():void{
    this.project_table.sort = this.sort
    
  }

  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.project_table.filter = filterValue.trim().toLowerCase();
  }

  viewKeys(element){
    console.log("View API Keys for ", element.id)
    var project_apiKeys = []
    this.apiService.getApiKeys().then(()=> {
      for (let key_obj of this.apiService.apiKeys){
        //console.log(key_obj)
        if (key_obj.projectId == element.id){
          project_apiKeys.push(key_obj)
        }
      }
    
    const dialogRef = this.dialog.open(ProjectTokensComponent, { 
      hasBackdrop:true,
      width:"100%",
      height:"auto",
      data: {
        apiKeys: project_apiKeys,
        projectData: element
      }
       })
      
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
      } else {
        console.log("Dialog dismissed")
      }
    })
  })
  }

  deleteProject(name, id){
    console.log("Delete Project", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Project?",
        button: "Delete Project",
        message: "Are you sure you want to delete project '"+ name + "' (ID: "+id+")?",
        method: "delete_Project"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.deleteProject(id).then(()=> this.refreshProjects())
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  async viewProject(element){
    console.log("View Project", element.id)
    await this.apiService.viewSingleProject(element.id)
    await this.apiService.getDatasetsforProject(element.id)
    this.router.navigate(["/project_overview"])
    
    
  }

  createProject(){
    console.log("Generating Project...")
    const dialogRef = this.dialog.open(CreateProjectComponent, {
      data: {type: "Project"}, 
      hasBackdrop:true
       })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.createProject(result.name, result.description).then(()=> {
          this.refreshProjects()
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  logout(){
    this.authService.logout()
  }

  refreshProjects(){
    this.apiService.getProjects().then(()=> {
      this.project_table = new MatTableDataSource(this.apiService.projects)
      this.project_table.sort = this.sort
    })
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
