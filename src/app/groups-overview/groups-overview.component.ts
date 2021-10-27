import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { CreateObjgroupComponent } from '../dialogs/create-objgroup/create-objgroup.component';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';
import { ApiService } from '../services/api.service';
import { MatSort } from '@angular/material/sort';

import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { HttpEvent, HttpEventType } from '@angular/common/http';


@Component({
  selector: 'app-groups-overview',
  templateUrl: './groups-overview.component.html',
  styleUrls: ['./groups-overview.component.scss']
})
export class GroupsOverviewComponent implements OnInit {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort

  obj_groups_table: any
  displayedColumns: string[]
  filelist_forUpload = []
  upload = false
  upload_progress = []

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService
  ) {
    console.log(this.upload_progress)
    console.log(this.apiService.obj_groups)
    this.displayedColumns = ["name", "description", "id", "created", "delete"]
    this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
  }

  ngOnInit(): void {
  }
  ngAfterViewInit(): void {
    this.obj_groups_table.paginator = this.paginator
    this.obj_groups_table.sort = this.sort
  }

  goBack() {
    this.router.navigate(["/project_overview"])
  }
  openProfile() {
    const dialogRef = this.dialog.open(ProfileDialogComponent, {
      position: { right: "10px", top: "10px" },
      hasBackdrop: true,

    })
  }
  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.obj_groups_table.filter = filterValue.trim().toLowerCase();
  }

  newObjectgroup() {
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {
        hasBackdrop: true,
        disableClose: true
      })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)
        result.objects.forEach((object, index) => {
          this.filelist_forUpload.push(object.file)
          this.upload_progress.push({filename: object.file.name, progress: 0})
          delete result.objects[index].uploaded
          delete result.objects[index].file
        });
        console.log(this.filelist_forUpload)
      
        this.upload = true
        console.log(this.upload_progress)
        this.apiService.createObjectGroup(this.apiService.dataset.id, result).then(res => {
          res["objectLinks"].forEach((element, index) => {
            console.log("UPLOADING FILE " + this.filelist_forUpload[index].name, "Link: ", element)
                this.uploadFile(element, this.filelist_forUpload[index], index)
              
          });   
          
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  
  uploadFile(element, file, index) {
    
    
      this.apiService.uploadFile(element["link"], file).subscribe((event: HttpEvent<any>) => {
        switch (event.type) {
          case HttpEventType.Sent:
            console.log('Request has been made!');
            break;
          case HttpEventType.ResponseHeader:
            console.log('Response header has been received!');
            break;
          case HttpEventType.UploadProgress:
            this.upload_progress[index].progress = Math.round(event.loaded / event.total * 100);
            console.log("Uploaded! "+this.upload_progress+"% "+ file.name)
            break;
        }
      })
    
  }

  openSnackBar() {
    this.snackBar.open("ID copied to Clipboard.", "", {
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
  deleteObjGroup(id) {
    console.log("deleting ObjGroup", id)
    this.apiService.deleteObjectGroup(id).then(()=> {
      this.refreshData()
    })
  }

  refreshData(){
    this.apiService.viewObjectGroups(this.apiService.dataset.id).then(()=> {
    this.obj_groups_table = new MatTableDataSource(this.apiService.project.datasets)
      this.obj_groups_table.paginator = this.paginator
      this.obj_groups_table.sort = this.sort
    })
  }
}
