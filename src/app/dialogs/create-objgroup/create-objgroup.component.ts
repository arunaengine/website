import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { CreateObjectComponent } from '../create-object/create-object.component';
//import {MatDatepickerModule} from '@angular/material/datepicker';
import * as moment from 'moment';

@Component({
  selector: 'app-create-objgroup',
  templateUrl: './create-objgroup.component.html',
  styleUrls: ['./create-objgroup.component.scss']
})
export class CreateObjgroupComponent implements OnInit {
  disabled = true
  new_objgroup = {
    name: "",
    description: "",
    generated: "",
    uuid: "",
    labels: [],
    //metadata needs function
    metadata: [],
    objects: []
  }
  
  generated_date = new Date
  label = {
    key: "",
    value: ""
  }
  label_table: any
  object_table: any
  labelColumns: string[]
  displayedColumns: string[]
  currentData = new Date()
  notValid = true
  maxDate =  new Date(this.currentData.getFullYear()+10, this.currentData.getMonth(), this.currentData.getDate())
  /*hours=[]
  minutes=[]
  selected_minute: number
  selected_hour: number*/
  
  constructor(private snackBar: MatSnackBar, private dialog: MatDialog) {
  
    
    console.log(this.maxDate)
    this.labelColumns=["key", "value", "delete"]
    this.displayedColumns=[ "name", "filename","filetype","contentLen", "uploaded" , "delete"]
    this.object_table = new MatTableDataSource(this.new_objgroup.objects)
    this.label_table = new MatTableDataSource(this.new_objgroup.labels)
    /*for (let i=0; i <24; i++ ){
      this.hours.push(i)
    }
    for (let i=0; i <60; i++ ){
      this.minutes.push(i)
    }*/

   }

  ngOnInit(): void {
    
  }
  addToDate(){
    
  }
  /*addtoObject() {
    if (this.selected_hour != undefined && this.selected_minute != undefined){
    var new_Date = new Date(this.generated_date.getFullYear(),this.generated_date.getMonth(), this.generated_date.getDate(),this.selected_hour, this.selected_minute)
    console.log(new_Date)
    this.new_objgroup.generated = new_Date.toISOString()
    console.log(this.new_objgroup.generated)
    }
    
  }*/

  addtoObject(){
    this.new_objgroup.generated = this.generated_date.toISOString()
    console.log(this.generated_date )
  }

  addtoLabels() {
    var add = true
    for (let label_inObj of this.new_objgroup.labels) {
      if (label_inObj.key == this.label.key) {
        add = false
      }
    }
    if (this.label.key != "" && this.label.value != "") {
      if (add) {
        this.new_objgroup.labels.push(this.label)
        this.label = {
          key: "",
          value: ""
        }
        this.label_table = new MatTableDataSource(this.new_objgroup.labels)
      } else {
        this.snackBar.open("Key already in use.", "", {
          duration: 3000,
          panelClass: ["warning-snackbar"]
        })
      }
    } else {
      this.snackBar.open("Key or Value can't be empty.", "", {
        duration: 3000,
        panelClass: ["warning-snackbar"]
      })
    }
  }
  deleteLabel(element) {
    const index: number = this.new_objgroup.labels.indexOf(element)
    //console.log(index)
    this.new_objgroup.labels.splice(index, 1)
    this.label_table = new MatTableDataSource(this.new_objgroup.labels)
  }
  deleteObj(element) {
    const index: number = this.new_objgroup.objects.indexOf(element)
    //console.log(index)
    this.new_objgroup.objects.splice(index, 1)
    this.object_table = new MatTableDataSource(this.new_objgroup.objects)
    this.isValid()
  }
  createObject(){
    const dialogRef = this.dialog.open(CreateObjectComponent,
      {hasBackdrop: true,
      disableClose: true
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.new_objgroup.objects.push(result)
        this.object_table = new MatTableDataSource(this.new_objgroup.objects)
        this.isValid()
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  isValid(){
    if (this.new_objgroup.name != "" && 
        this.new_objgroup.description!= ""&&
        this.new_objgroup.objects.length != 0){
          this.notValid = false
        } else {
          this.notValid = true
        }
  }
}
