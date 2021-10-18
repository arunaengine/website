import { Component, OnInit } from '@angular/core';
import {MatDialog} from '@angular/material/dialog';

@Component({
  selector: 'app-create-project',
  templateUrl: './create-project.component.html',
  styleUrls: ['./create-project.component.scss']
})
export class CreateProjectComponent implements OnInit {

  new_project = {
    name: "",
    description:""
  }
  disabled = true

  constructor(public dialog: MatDialog) { }

  ngOnInit(): void {
  }
  /*submit(){
    console.log(this.new_project)
  }*/
  validProject(){
    if(this.new_project.name != "" && this.new_project.description != ""){
      this.disabled= false
    } else {
      this.disabled = true
    }
  }
}
