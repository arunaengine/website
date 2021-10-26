import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CreateObjgroupComponent } from '../dialogs/create-objgroup/create-objgroup.component';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';
import { ApiService } from '../services/api.service';
import {MatSort} from '@angular/material/sort';

import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';


@Component({
  selector: 'app-groups-overview',
  templateUrl: './groups-overview.component.html',
  styleUrls: ['./groups-overview.component.scss']
})
export class GroupsOverviewComponent implements OnInit {
  
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort:MatSort

  obj_groups_table: any
  displayedColumns: string[]

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService
  ) { 
    console.log(this.apiService.obj_groups)
    this.displayedColumns=[ "name", "description","id","created", "delete"]
    this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
  }

  ngOnInit(): void {
  }
  ngAfterViewInit():void{
    this.obj_groups_table.paginator = this.paginator
    this.obj_groups_table.sort = this.sort
  }

  goBack(){
    this.router.navigate(["/project_overview"])
  }
  openProfile(){
    const dialogRef = this.dialog.open(ProfileDialogComponent, {
      position: {right: "10px", top: "10px"},
      hasBackdrop: true,
      
    })
  }
  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.obj_groups_table.filter = filterValue.trim().toLowerCase();
  }

  newObjectgroup(){
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {hasBackdrop: true,
        disableClose: true
      })
      dialogRef.afterClosed().subscribe(result => {
        if (result){
          console.log("Dialog closed: ", result)
          this.apiService.createObjectGroup(this.apiService.dataset.id, result)
        } else {
          console.log("Dialog dismissed")
        }
      })
  }
  openSnackBar(){
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
  deleteObjGroup(id){
    console.log("deleting ObjGroup", id)
 }
}
