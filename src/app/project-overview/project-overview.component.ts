import { Component, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { AlertDialogComponent } from '../dialogs/alert-dialog/alert-dialog.component';
import { CreateProjectComponent } from '../dialogs/create-project/create-project.component';

@Component({
  selector: 'app-project-overview',
  templateUrl: './project-overview.component.html',
  styleUrls: ['./project-overview.component.scss']
})
export class ProjectOverviewComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  dataset_table: any
  displayedColumns: string[]
  dummy= [
    {id: "001", name: "dyinglight", datatype: "story"},
    {id: "002", name: "bf2042", datatype: "fps"}

  ]

  constructor(
    private router: Router,
    public dialog: MatDialog
  ) {
    this.displayedColumns=["id", "name", "datatype", "delete"]
    this.dataset_table = new MatTableDataSource(this.dummy)
   }

  ngOnInit(): void {
  }

  goBack(){
    this.router.navigate(["/home"])
  }
  ngAfterViewInit():void{
    this.dataset_table.sort = this.sort
  }
  deleteDataset(name, id){
    console.log("Deleting Dataset ", id)
    const dialogRef = this.dialog.open(AlertDialogComponent,{
      data:{
        title: "Delete Dataset?",
        button: "Dataset",
        message: "Are you sure you want to delete  '"+ name + "' (ID: "+id+")?"
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

  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataset_table.filter = filterValue.trim().toLowerCase();
  }

  newDataset(){
    console.log("Generating dataset...")
    const dialogRef = this.dialog.open(CreateProjectComponent, { 
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
}
