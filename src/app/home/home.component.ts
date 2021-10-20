import { Component, OnInit, ViewChild } from '@angular/core';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import {MatDialog} from '@angular/material/dialog';
import { CreateProjectComponent } from '../dialogs/create-project/create-project.component';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { ProjectTokensComponent } from '../dialogs/project-tokens/project-tokens.component';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  project_table: any
  displayedColumns: string[]
  dummy_data = [
    {name: "Dummy1", description: "Some Dummy dataset", id: "007"},
    {name: "Dummy2", description: "Second Dummy dataset", id: "2042"}
  ]
  constructor(
    public dialog: MatDialog,
    private router: Router,
    public authService: AuthService
  ) { 
    this.displayedColumns=["name", "description", "id", "details","generateKeys", "deleteProjects"]
    this.project_table = new MatTableDataSource(this.dummy_data)
    
    console.log(this.project_table)
  }

  ngOnInit(): void {
    console.log(this.authService.user_data)
  }

  ngAfterViewInit():void{
    this.project_table.sort = this.sort
  }

  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.project_table.filter = filterValue.trim().toLowerCase();
  }
  viewKeys(id){
    console.log("View API Keys for ", id)
    const dialogRef = this.dialog.open(ProjectTokensComponent, { 
      hasBackdrop:true,
      width:"100%",
      height:"auto"
       })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  deleteProject(name, id){
    console.log("Delete Project", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Project?",
        button: "Delete Project",
        message: "Are you sure you want to delete projcet '"+ name + "' (ID: "+id+")?"
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
  viewProject(id){
    console.log("View Project", id)
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
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  logout(){
    this.authService.logout()
  }
}
