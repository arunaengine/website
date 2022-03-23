import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ProfileDialogComponent } from '../dialogs/profile-dialog/profile-dialog.component';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CreateVersionComponent } from '../dialogs/create-version/create-version.component';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { DetailsDialogComponent } from '../dialogs/details-dialog/details-dialog.component';
import { LoadingComponent } from '../dialogs/loading/loading.component';
import { ConfigDetailsDialogComponent } from '../dialogs/config-details-dialog/config-details-dialog.component';

@Component({
  selector: 'app-version-overview',
  templateUrl: './version-overview.component.html',
  styleUrls: ['./version-overview.component.scss']
})
export class VersionOverviewComponent implements OnInit {

  @ViewChild(MatSort) sort: MatSort

  table_data: any
  displayedColumns: string[]
  forward_disabled = false
  back_disabled = false
  noObjGroup = true

  constructor(
    private dialog: MatDialog,
    public apiService: ApiService,
    public authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    console.log(this.apiService.datasetVersions)
    if (Number(this.apiService.dataset.stats.objectGroupCount) > 0){
      this.noObjGroup = false
    }
    this.table_data = new MatTableDataSource(this.apiService.datasetVersions)
    this.displayedColumns=["name", "description","version", "created","actions"]
    /*if (this.apiService.paginantor_config_versions.activepage + 1 == this.apiService.paginantor_config_versions.pagecount) {
      this.forward_disabled = true
    } else {
      this.forward_disabled = false
    }
    if (this.apiService.paginantor_config_versions.activepage == 0) {
      this.back_disabled = true
    } else {
      this.back_disabled = false
    }*/
   }
  

  ngOnInit(): void {
    
  }

  ngAfterViewInit():void{
    this.table_data.sort = this.sort
  }
  applyFilter(event: Event) {
    //Function for filtering the project table
    const filterValue = (event.target as HTMLInputElement).value;
    this.table_data.filter = filterValue.trim().toLowerCase();
  }

  async createDatasetVersion(element?: any) {
    console.log('Creating dataset version')
    const loadingRef = this.dialog.open(LoadingComponent, {
      hasBackdrop: true,
      disableClose: true
    })
    
      if (element) {
      console.log("Creating from element", element)
      var fromOld = {}
      await this.apiService.getDatasetVersion(element.id).then((versionDetails:any) => { 
        Object.assign(fromOld, {versionDetails: versionDetails})
        })
      await  this.apiService.getGroupsInVersion(element).then(groups => {
          Object.assign(fromOld,{selectedGroups: groups})
        })
      
    }
    this.apiService.getObjectGroupsForVersioning(this.apiService.dataset.id).then(res => {
      loadingRef.close()
      const dialogRef = this.dialog.open(CreateVersionComponent, {
      hasBackdrop: true,
      width: '100%',
      height: 'auto',
      disableClose: true,
      data: {
        objectGroups: res,
        dataset: this.apiService.dataset,
        fromOld: fromOld,
      }
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        var versionObject = result.specs
        result.groups.forEach(group => {versionObject.objectGroupIds.push(group.id)})
        this.apiService.createDatasetVersion(versionObject).then(_ => {
          this.refreshVersions()
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
    })
    
  }

  refreshVersions(){
    //Function to refresh the data table
    this.apiService.viewDatasetVersions(this.apiService.dataset).then(()=> {
      this.table_data = new MatTableDataSource(this.apiService.datasetVersions)
      this.table_data.sort = this.sort
    })
  }

  deleteVersion(name, id){
    console.log("Deleting Version ", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Version?",
        button: "Delete Version",
        message: "Are you sure you want to delete  '"+ name + "' (ID: "+id+")?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.deleteVersion(id).then(()=> {
          this.refreshVersions()
        })
      } else {
        console.log("Dialog dismissed")
      }
    })
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
  goBack() {
    this.router.navigate(["/dataset_overview"])
  }
  openSnackBar(){
    //Function to show a snackbar
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }

  viewDetails(element){
    console.log("See Details...")
    
    this.apiService.getDatasetVersion(element.id).then((versionDetails:any) => { 
    this.apiService.getGroupsInVersion(element).then(groups => {
      Object.assign(versionDetails, {type: "Version", objectGroups: groups})
      console.log("version details",versionDetails)
      const dialogRef = this.dialog.open(DetailsDialogComponent, {
        data: versionDetails,
        hasBackdrop: true,
        width: "35%"
      })
    })
    
    })
  }

  /*changePage(action) {
    // handling the pagination of the dataset
    if (action == "forward") {
      this.back_disabled = false
      this.apiService.paginantor_config_versions.activepage += 1
      if (this.apiService.paginantor_config_versions.activepage + 1 == this.apiService.paginantor_config_versions.pagecount) {
        this.forward_disabled = true
      } else {
        this.forward_disabled = false
      }
    }
    if (action == "back") {
      this.forward_disabled = false
      this.apiService.paginantor_config_versions.activepage -= 1
      if (this.apiService.paginantor_config_versions.activepage == 0) {
        this.back_disabled = true
      } else {
        this.back_disabled = false
      }
    }
    this.refreshVersions()
    console.log(this.apiService.paginantor_config_versions)
  }*/
}
