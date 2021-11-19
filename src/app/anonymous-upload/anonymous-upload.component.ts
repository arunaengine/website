import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { CreateObjgroupComponent } from '../dialogs/create-objgroup/create-objgroup.component';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-anonymous-upload',
  templateUrl: './anonymous-upload.component.html',
  styleUrls: ['./anonymous-upload.component.scss']
})
export class AnonymousUploadComponent implements OnInit {
  query_content: any
  file: File
  file_name = ""
  uploading = false
  no_file = true
  file_list = []
  objectID = ""
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private apiService: ApiService
  ) {
    this.route.queryParams.subscribe(params => {
      if (params.action == undefined) {
        this.router.navigate(["/login"])
      }
      if (params.name == undefined) {
        this.router.navigate(["/login"])
      }
      if (params.link == undefined) {
        this.router.navigate(["/login"])
      }
      if (params.id == undefined) {
        this.router.navigate(["/login"])
      }
      if (params.description == undefined) {
        this.router.navigate(["/login"])
      }
      this.query_content = params
      console.log(params)
    })
  }

  ngOnInit(): void {
  }

 /* createObjectGroup() {
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {
        hasBackdrop: true,
        disableClose: true
      })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)

      } else {

        console.log("Dialog dismissed")
      }
    })
  }*/
  openSnackBar() {
    this.snackBar.open("ID copied to Clipboard.", "", {
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }

  onFileInput(files: FileList | null) {
    if (files) {
      this.file = files[0]
      this.file_name = this.file.name
      console.log(this.file)
      this.no_file = false
    } else {
      this.no_file = true
    }



  }

  async UploadFile() {
     this.uploading = true
}

}
