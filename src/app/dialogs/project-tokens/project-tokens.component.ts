import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { AlertDialogComponent } from '../alert-dialog/alert-dialog.component';


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
    public dialog: MatDialog
  ) {
    this.displayedColumns=["id", "token", "rights", "delete"]
    this.token_table = new MatTableDataSource(this.dummy)
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
        message: "Are you sure you want to delete the API key (ID: "+id+")?"
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

  createProjectToken(){
    console.log("Creating new Key...")
  }

  }
