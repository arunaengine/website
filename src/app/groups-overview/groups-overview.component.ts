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

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService
  ) {
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

  async newObjectgroup() {
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
          delete result.objects[index].uploaded
          delete result.objects[index].file
        });
        console.log(this.filelist_forUpload)
        this.apiService.createObjectGroup(this.apiService.dataset.id, result).then(res => {
          
          for (let element of res["objectLinks"]) {
            for (let file of this.filelist_forUpload) {
              if (element.filename == file.name.split(".")[0]) {

                console.log("UPLOADING FILE " + file.name)
                this.uploadFile(element, file)

              }
            }

          }
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  uploadFile(element, file) {
    var progress = 0
    return new Promise(resolve => {
      this.apiService.uploadFile(element["link"], file).subscribe((event: HttpEvent<any>) => {
        switch (event.type) {
          case HttpEventType.Sent:
            console.log('Request has been made!');
            break;
          case HttpEventType.ResponseHeader:
            console.log('Response header has been received!');
            break;
          case HttpEventType.UploadProgress:
            progress = Math.round(event.loaded / event.total * 100);
            if (progress % 10 == 0) {
              console.log("Uploaded! "+progress+"% "+ file.name)
            }
            if (progress == 100){
              resolve("")
            }
            break;
        }
      })
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
  }
}
