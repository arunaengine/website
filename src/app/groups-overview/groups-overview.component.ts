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
  filelist_forUpload = []
  upload_progress = []
  files_userUpload = []
  uploadPanel = false
  upload_userFiles = false
  uploadedFinishedButton = false
  date_range = {start: new Date, end: new Date}

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    public apiService: ApiService,
    public authService: AuthService,
    private clipboard: Clipboard
  ) {
    console.log(this.upload_progress)
    console.log(this.apiService.obj_groups)
    this.displayedColumns = ["name", "description","objectcount","created",   "actions"]
    this.inner_displayedColumns = ["filename", "filetype","created", "filesize", "actions"]
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
          if (object.uploaded){
            this.filelist_forUpload.push(object.file)
            this.upload_progress.push({filename: object.file.name, progress: 0, uploaded: false, userUpload: false})
          } else {
            
            this.filelist_forUpload.push({userUpload: true, object: object})
            this.upload_progress.push({filename: object.filename +"." +object.filetype, progress: 0, uploaded: true, userUpload: true})
          }
          
          delete result.objects[index].uploaded
          delete result.objects[index].file
        });
        console.log(this.filelist_forUpload)
      
        this.uploadPanel = true
        console.log(this.upload_progress)
        this.apiService.createObjectGroup(this.apiService.dataset.id, result).then(res => {
          res["objectLinks"].forEach((element, index) => {
            if (this.upload_progress[index].userUpload == false){
                  console.log("UPLOADING FILE " + this.filelist_forUpload[index].name, "Link: ", element)
                  this.uploadFile(element, this.filelist_forUpload[index], index).then(()=> {
                  console.log("Finished Upload "+ this.filelist_forUpload[index].name)
                  this.upload_progress[index].uploaded = true
                  this.uploadFinished()
                })
                } else {
                  console.log("User Upload File: ", element)
                  this.files_userUpload.push({filespecs: this.filelist_forUpload[index], fromServer: element, file: null, file_name: "", uploadnotAllowed:true, process: {progress: 0, uploaded: false, uploading: false}})
                  
                  this.uploadFinished()
                }
                
            if ( res["objectLinks"].length -1 == index){
              this.upload_userFiles = true
            }
          })
          
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  
  uploadFinished(){
    var all_uploaded = true
    this.upload_progress.forEach(element => {
      console.log(element)
      if (element.uploaded == false){
        all_uploaded = false
      }
    })
    
    if (all_uploaded){
      this.uploadedFinishedButton = true
      if (this.files_userUpload.length == 0){
        this.openSnackBar("Finished uploading files","success-snackbar")
      } else {
        this.openSnackBar("Finished uploading files, but user input needed","success-snackbar")
        
      }
      
      console.log("UPLOAD FINISHED FOR ALL FILES")
      console.log("Files for user Upload", this.files_userUpload)
      this.filelist_forUpload = []
      this.refreshData()
    }
  }

  hideUploadedFiles(){
    this.upload_progress = []
    if (this.files_userUpload.length == 0){
      this.uploadedFinishedButton = false
      this.uploadPanel = false
      this.upload_userFiles = false
      this.files_userUpload= []
    }
  }

  onFileInput(files: FileList | null , index){
    if (files){
      this.files_userUpload[index].file=files[0]
      this.files_userUpload[index].file_name=this.files_userUpload[index].file.name
      this.files_userUpload[index].uploadnotAllowed= false
      console.log(this.files_userUpload[index])
    } else {
      this.files_userUpload[index].uploadnotAllowed= true
    }
  }

  uploadFile(element, file, index) {
    
      return new Promise (resolve => {
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
            if (event.loaded == event.total){
              resolve("")
            }
            break;
        }
      })
      })    
  }

  uploadSingleFile(index){
    this.files_userUpload[index].process.uploading = true
    return new Promise (resolve => {
      this.apiService.uploadFile(this.files_userUpload[index].fromServer.link, this.files_userUpload[index].file).subscribe((event: HttpEvent<any>) => {
        switch (event.type) {
          case HttpEventType.Sent:
            console.log('Request has been made!');
            break;
          case HttpEventType.ResponseHeader:
            console.log('Response header has been received!');
            break;
          case HttpEventType.UploadProgress:
            this.files_userUpload[index].process.progress = Math.round(event.loaded / event.total * 100);
            if (event.loaded == event.total){
              resolve("")
            }
            break;
        }
      })
    })
  }

  hideFile(element){
    const index: number = this.files_userUpload.indexOf(element)
    this.files_userUpload.splice(index, 1)
    if (this.files_userUpload.length == 0){
      if (this.uploadedFinishedButton){
        this.hideUploadedFiles()
      }
    }
  }

  openSnackBar(message, design) {
    this.snackBar.open(message, "", {
      duration: 3000,
      panelClass: [design]
    })
  }
  deleteObjGroup(name,id) {
    console.log("deleting ObjGroup", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Object Group?",
        button: "Delete Object Group",
        message: "Are you sure you want to delete  '"+ name + "' (ID: "+id+")?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.deleteObjectGroup(id).then(()=> {
      this.refreshData()
      })
      } else {
        console.log("Dialog dismissed")
      }
    })
    
  }

  downloadObject(object){
    console.log("Downloading Object", object)
    this.apiService.downloadSingleObject(object)
  }

  refreshData(){
    this.apiService.viewObjectGroups(this.apiService.dataset).then(()=> {
    this.obj_groups_table = new MatTableDataSource(this.apiService.obj_groups)
      this.obj_groups_table.paginator = this.paginator
      this.obj_groups_table.sort = this.sort
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
  downloadObjectGroup(element){
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

  shareObjectGroup(element){
    var url = "http://localhost:4200/anonymous_upload/?action=uploadObject&name="+encodeURI(element.name)+
    "&link=XXX&id="+element.id+"&description="+encodeURI(element.description)
    this.clipboard.copy(url)
    this.openSnackBar('Share URL copied to Clipboard.', 'success-snackbar')
  }

 shareCreateObjectGroups(){
   console.log(this.obj_groups_table)
    var url = "http://localhost:4200/anonymous_upload/?action=uploadObject&name="+encodeURI(this.apiService.dataset.name)+
    "&link=XXX&id="+this.apiService.dataset.id+"&description="+encodeURI("Dummy Description first sample upload")
    console.log(url)
    this.clipboard.copy(url)
    this.openSnackBar('Share URL copied to Clipboard.', 'success-snackbar')
  }


}
