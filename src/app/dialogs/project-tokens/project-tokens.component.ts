import { Component, OnInit, ViewChild, Inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { AlertDialogComponent } from '../alert-dialog/alert-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ApiService } from 'src/app/services/api.service';


@Component({
  selector: 'app-project-tokens',
  templateUrl: './project-tokens.component.html',
  styleUrls: ['./project-tokens.component.scss']
})
export class ProjectTokensComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  token_table: any
  displayedColumns: string[]
  dummy= [
    {id: "001", token: "bf2042", rights: "ich"},
    {id: "002", token: "lol", rights: "all"}

  ]

  constructor(
    public dialog: MatDialog,
    private snackBar: MatSnackBar,
    private apiService: ApiService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    console.log(this.data)
    this.displayedColumns=["id", "token", "rights", "delete"]
    this.token_table = new MatTableDataSource(this.data.apiKeys)
   }

  ngOnInit(): void {
  }

  ngAfterViewInit():void{
    this.token_table.sort = this.sort
  }
  deleteKey(id){
    console.log("Delete Api key ", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete API Key?",
        button:"Delete Key",
        message: "Are you sure you want to delete the API Key (ID: "+id+")?"
      },
      hasBackdrop: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.apiService.deleteApiKey(id).then(()=> {
          this.refreshKeys()})
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  createProjectToken(){
    console.log("Creating new Key...")
    this.apiService.createApiKey(this.data.projectData.id).then(()=> {
      this.refreshKeys()
    })
  }

  openSnackBar(){
    this.snackBar.open("Token copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }

  refreshKeys(){
    this.data.apiKeys = []
      for (let key_obj of this.apiService.apiKeys){
        console.log(key_obj.projectId, this.data.projectData.id)
        if (key_obj.projectId == this.data.projectData.id){
          this.data.apiKeys.push(key_obj)
        }
      }
      console.log(this.data)
      this.token_table = new MatTableDataSource(this.data.apiKeys)
      this.token_table.sort = this.sort
  }

  }
