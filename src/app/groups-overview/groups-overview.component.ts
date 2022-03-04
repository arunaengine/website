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
import { AuthService } from '../services/auth.service';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { DownloadlinkDialogComponent } from '../dialogs/downloadlink-dialog/downloadlink-dialog.component';
import { Clipboard } from '@angular/cdk/clipboard';
import { LoadingComponent } from '../dialogs/loading/loading.component';
import { BehaviorSubject } from 'rxjs';
import { DetailsDialogComponent } from '../dialogs/details-dialog/details-dialog.component';
import { ConfigDetailsDialogComponent } from '../dialogs/config-details-dialog/config-details-dialog.component';


@Component({
  selector: 'app-groups-overview',
  templateUrl: './groups-overview.component.html',
  styleUrls: ['./groups-overview.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class GroupsOverviewComponent implements OnInit {

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort

  obj_groups_table: any
  displayedColumns: string[]
  inner_displayedColumns: string[]
  date_range = { start: new Date, end: new Date }
  forward_disabled = false
  back_disabled = false
  

  //Updated Upload
  auto_upload = []
  multipart_upload = []
  user_upload = []
  uploadingProgressPanel = false
  userUploadPanel = false
  auto_upload_count = 0
  multipart_upload_count = 0

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService,
    public authService: AuthService,
    private clipboard: Clipboard
  ) {
    //console.log(this.upload_progress)
    console.log(this.apiService.obj_groups)
    this.displayedColumns = ["name", "description", "objectcount", "created","status", "actions"]
    this.inner_displayedColumns = ["filename", "filetype", "created", "filesize", "actions"]
    this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
    if (this.apiService.paginantor_config.activepage + 1 == this.apiService.paginantor_config.pagecount) {
      this.forward_disabled = true
    } else {
      this.forward_disabled = false
    }
    if (this.apiService.paginantor_config.activepage == 0) {
      this.back_disabled = true
    } else {
      this.back_disabled = false
    }
  }

  ngOnInit(): void {
  }
  ngAfterViewInit(): void {
    this.obj_groups_table.paginator = this.paginator
    this.obj_groups_table.sort = this.sort
  }

  goBack() {
    this.router.navigate(["/dataset_overview"])
  }

  openEndpoints(){
    //Function to open the EndpointURL dialog
    const dialogRef = this.dialog.open(ConfigDetailsDialogComponent, {
      position: {right: "10px", top: "10px"},
      hasBackdrop: true,
      width: "30%"
    })
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
    //start the dialog for creating an object group
    //output handling when dialog closed
    //automatic file upload of the created objects
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {
        hasBackdrop: true,
        disableClose: true
      })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        var filelist_forUpload = []
        console.log("Dialog closed: ", result)
        result.objects.forEach((object, index) => {
          if (object.uploaded) {
            // divide output of dialog into 3 upload cases -> File was selected: auto/multipart upload - no File selected: user upload
            if (object.file.size < 15000000) {
              filelist_forUpload.push({ uploadCase: "auto", file: object.file, uploadParams: {} })
            } else {
              filelist_forUpload.push({ uploadCase: "multipart", file: object.file, uploadParams: {} })
            }
          } else {
            filelist_forUpload.push({ uploadCase: "user", file: object, uploadParams: {} })
          }

          delete result.objects[index].uploaded
          delete result.objects[index].file
        });
        console.log(filelist_forUpload)
        // exectue api call to create object group and get the upload links and ids as response
        this.apiService.createObjectGroup(this.apiService.dataset.id, result).then(res => {
          res["objectLinks"].forEach((element, index) => {
            filelist_forUpload[index].uploadParams["id"] = element.objectId
            filelist_forUpload[index].uploadParams["link"] = element.link

          })
          console.log(filelist_forUpload)
          for (let object of filelist_forUpload){
            console.log(object)
            if (object.uploadCase == "auto"){
              object["htmlKeys"] = {filename: object.file.name, progress: 0}
              object["uploadStatus"] = {state: 0} 
              this.auto_upload.push(object)
            }
            if (object.uploadCase == "multipart"){
              object["htmlKeys"] = {filename: object.file.name, progress: 0}
              //Upload state -> 0: not started, 1: uploading, 3: finished
              object["uploadStatus"] = {state: 0}
              this.multipart_upload.push(object)
            }
            if (object.uploadCase == "user"){
              object["htmlKeys"] = {
                filename: object.file.filename +"." +object.file.filetype, 
                filename_input:"",
                uploadnotAllowed: true,
                progress: 0
              }
              this.user_upload.push(object)
            }
          }
          console.log(this.auto_upload, this.multipart_upload, this.user_upload)
          this.uploadAuto()
          this.uploadMultipart()
          if (this.auto_upload.length > 0 || this.multipart_upload.length > 0){0
            this.uploadingProgressPanel = true
          }
          if ( this.user_upload.length > 0){
            this.userUploadPanel = true
          }
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  uploadAuto(){
    //Upload loop for files < 15mb
    for (let [index, element] of this.auto_upload.entries()){
      if (element.uploadStatus.state == 0){
            this.auto_upload[index].uploadStatus.state = 1
              this.uploadFile(element, index).then(()=> {
                this.auto_upload_count += 1

                // launch upload finished
                if (this.auto_upload_count == this.auto_upload.length){
                  this.finishUpload()
                }
              })
      }
    }
  }

  uploadFile(element, index) {
    //upload for one file < 15mb
    return new Promise(resolve => {
      this.apiService.uploadFile(element.uploadParams.link, element.file).subscribe((event: HttpEvent<any>) => {
        switch (event.type) {
          case HttpEventType.Sent:
            console.log('Request has been made!');
            break;
          case HttpEventType.Response:
            console.log('Upload Finished!', element.file.name);
            resolve("")
            break;
          case HttpEventType.UploadProgress:
            console.log(event)
           this.auto_upload[index].htmlKeys.progress = Math.round(event.loaded / event.total * 100);
            break;
        }
      })
    })
  }

  uploadMultipart(){
    //upload loop for multipart upload -> files > 15mb
    for (let [index, element] of this.multipart_upload.entries()) {
      if (element.uploadStatus.state == 0){
        this.multipart_upload[index].uploadStatus.state = 1
        this.apiService.chunksQuantity_ls.push(0)
        this.apiService.chunksQueue_ls.push(new Array())
        this.apiService.activeConnections_ls.push(0)
        this.apiService.multipart_res_ls.push([])
        this.apiService.multipart_progress_ls.push({})
        this.apiService.multipart_loaded.push(new BehaviorSubject({progress: 0, finished: false}))
        console.log(element, index)
        this.apiService.multipart_loaded[index].subscribe(progress_value => {
          //Subscribe progress event
          this.multipart_upload[index].htmlKeys.progress =Math.round(progress_value.progress / element.file.size *100)
          
          //launch upload finished
          if (progress_value.finished){
            this.multipart_upload_count += 1
            if (this.multipart_upload_count == this.multipart_upload.length){
              this.finishUpload()
            }
          }
        })
        
        this.apiService.initMultipartUpload(element.uploadParams.id).then(() => {
          this.apiService.fullMultipartUpload(element, index)
      })
      }
      
    }
  }

  finishUpload(){
      //reset global upload variables
    console.log(this.multipart_upload.length, this.multipart_upload_count, this.auto_upload.length, this.auto_upload_count)
    if (this.multipart_upload.length == this.multipart_upload_count && this.auto_upload.length == this.auto_upload_count){
      this.uploadingProgressPanel = false
      console.log("FINISHED SMALL FILE UPLOAD!", this.auto_upload)
      this.auto_upload = []
      this.auto_upload_count = 0
      console.log("FINSIHED LARGR FILE UPLOAD!", this.multipart_upload)
      this.multipart_upload = []
      this.multipart_upload_count = 0
      this.apiService.chunksQuantity_ls = []
      this.apiService.chunksQueue_ls = []
      this.apiService.activeConnections_ls = []
      this.apiService.multipart_res_ls = []
      this.apiService.multipart_progress_ls = []
      this.apiService.multipart_loaded = []
      this.openSnackBar("All Files uploaded", "success-snackbar")
      this.refreshData()
    }
    
  }

  onFileInput(files: FileList | null, index) {
    //handling user file input
      if (files) {
        this.user_upload[index].file = files[0]
        this.user_upload[index].htmlKeys.filename_input = this.user_upload[index].file.name
        this.user_upload[index].htmlKeys.uploadnotAllowed = false
      } else {
        this.user_upload[index].htmlKeys.uploadnotAllowed = true
      }
    }

  uploadSingleFile(index) {
    // uploading single file selected by user
      this.user_upload[index].htmlKeys.uploading = true
      this.user_upload[index]["uploadStatus"] = {state:0}
      if (this.user_upload[index].file.size < 15000000){
        //small Upload
        this.auto_upload.push(this.user_upload[index])
        console.log(this.auto_upload)
        this.uploadAuto()
      } else {
        //Multipart Upload
        this.multipart_upload.push(this.user_upload[index])
        console.log(this.multipart_upload)
        this.uploadMultipart()
      }
      this.user_upload.splice(index,1)
      if ( this.user_upload.length == 0){
        this.userUploadPanel = false
      }
    }


  openSnackBar(message, design) {
    this.snackBar.open(message, "", {
      duration: 3000,
      panelClass: [design]
    })
  }
  deleteObjGroup(name, id) {
    // launch dialog for deleting object group
    console.log("deleting ObjGroup", id)
    const dialogRef = this.dialog.open(AlertDialogComponent, {
      data: {
        title: "Delete Object Group?",
        button: "Delete Object Group",
        message: "Are you sure you want to delete  '" + name + "' (ID: " + id + ")?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)
        this.apiService.deleteObjectGroup(id).then(() => {
          this.refreshData()
        })
      } else {
        console.log("Dialog dismissed")
      }
    })

  }

  downloadObject(object) {
    // download single object
    console.log("Downloading Object", object)
    this.apiService.downloadSingleObject(object)
  }

  refreshData() {
    // refreshes the data table
    const dialogRef = this.dialog.open(LoadingComponent, {
      hasBackdrop: true,
      disableClose: true
    })
    this.apiService.viewObjectGroups(this.apiService.dataset).then(() => {
      this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
      this.obj_groups_table.paginator = this.paginator
      this.obj_groups_table.sort = this.sort
      dialogRef.close()
    })
  }
  /*viewSelectedGroups(){
    console.log(this.date_range)
    this.apiService.viewSelectedObjectGroups(this.apiService.dataset.id, this.date_range.start.toISOString(), this.date_range.end.toISOString()).then(()=> {
      this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
      this.obj_groups_table.paginator = this.paginator
      this.obj_groups_table.sort = this.sort
    })
  }*/
  downloadObjectGroup(element) {
    // download object group
    console.log("Downloading Object group...")
    this.apiService.downloadObjectGroupNew(element)
    /*
    this.apiService.downloadObjectGroup(element.id).then(res => {
    const dialogRef = this.dialog.open(DownloadlinkDialogComponent,{
        data: {title: "Download Link: "+element.name, link: res["url"]},
        hasBackdrop: true
      })
    })*/
  }

  shareObjectGroup(element) {
    var url = "http://localhost:4200/anonymous_upload/?action=uploadObject&name=" + encodeURI(element.name) +
      "&link=XXX&id=" + element.id + "&description=" + encodeURI(element.description)
    this.clipboard.copy(url)
    this.openSnackBar('Share URL copied to Clipboard.', 'success-snackbar')
  }

  shareCreateObjectGroups() {
    console.log(this.obj_groups_table)
    var url = "http://localhost:4200/anonymous_upload/?action=uploadObject&name=" + encodeURI(this.apiService.dataset.name) +
      "&link=XXX&id=" + this.apiService.dataset.id + "&description=" + encodeURI("Dummy Description first sample upload")
    console.log(url)
    this.clipboard.copy(url)
    this.openSnackBar('Share URL copied to Clipboard.', 'success-snackbar')
  }

  changePage(action) {
    // handling the pagination of the dataset
    if (action == "forward") {
      this.back_disabled = false
      this.apiService.paginantor_config.activepage += 1
      if (this.apiService.paginantor_config.activepage + 1 == this.apiService.paginantor_config.pagecount) {
        this.forward_disabled = true
      } else {
        this.forward_disabled = false
      }
    }
    if (action == "back") {
      this.forward_disabled = false
      this.apiService.paginantor_config.activepage -= 1
      if (this.apiService.paginantor_config.activepage == 0) {
        this.back_disabled = true
      } else {
        this.back_disabled = false
      }
    }
    this.refreshData()
    console.log(this.apiService.paginantor_config)
  }

  viewDetails(element){
    console.log("See Details...")    
    this.apiService.getObjectGroup(element.id).then((res: any) => {
      console.log(res)
      Object.assign(res, {type: "Object Group"})
       const dialogRef = this.dialog.open(DetailsDialogComponent, {
        data: res,
        hasBackdrop: true,
        width: "37%"
      })
    })
  }

}
