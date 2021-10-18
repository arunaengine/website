import { Component, OnInit, ViewChild } from '@angular/core';
import {MatSort} from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  @ViewChild(MatSort) sort:MatSort

  project_table: any
  displayedColumns: string[]
  dummy_data = [
    {name: "Dummy1", description: "Some Dummy dataset", id: "007"},
    {name: "Dummy2", description: "Second Dummy dataset", id: "2042"}
  ]
  constructor() { 
    this.displayedColumns=["name", "description", "id", "details","generateKeys", "deleteProjects"]
    this.project_table = new MatTableDataSource(this.dummy_data)
    
    console.log(this.project_table)
  }

  ngOnInit(): void {
    
  }

  ngAfterViewInit():void{
    this.project_table.sort = this.sort
  }

  applyFilter(event: Event) {
    //filter table
    const filterValue = (event.target as HTMLInputElement).value;
    this.project_table.filter = filterValue.trim().toLowerCase();
  }
  viewKeys(id){
    console.log("Generate API Key for ", id)
  }
  deleteProject(id){
    console.log("Delete Project", id)
  }
  viewDataset(id){
    console.log("View Project", id)
  }

}
