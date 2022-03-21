import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { CreateObjectComponent } from '../create-object/create-object.component';
import { MetadataAddComponent } from '../metadata-add/metadata-add.component';
import { MetadataDetailsComponent } from '../metadata-details/metadata-details.component';
//import {MatDatepickerModule} from '@angular/material/datepicker';

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
  requirements = [" Name", " Description", " Min. 1 Object"]

  maxDate = new Date(this.currentData.getFullYear() + 10, this.currentData.getMonth(), this.currentData.getDate())
  /*hours=[]
  minutes=[]
  selected_minute: number
  selected_hour: number*/
  metaColumns: string[]
  meta_table: any
  metadata_html = []
  disableAnimation = true;
  constructor(private snackBar: MatSnackBar, private dialog: MatDialog) {


    console.log(this.maxDate)
    this.labelColumns = ["key", "value", "delete"]
    this.displayedColumns = ["filename", "filetype", "contentLen", "uploaded", "delete"]
    this.object_table = new MatTableDataSource(this.new_objgroup.objects)
    this.label_table = new MatTableDataSource(this.new_objgroup.labels)
    this.metaColumns = ["name", "actions"]
    this.meta_table = new MatTableDataSource(this.metadata_html)

    /*for (let i=0; i <24; i++ ){
      this.hours.push(i)
    }
    for (let i=0; i <60; i++ ){
      this.minutes.push(i)
    }*/

  }

  ngOnInit(): void {

  }

  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

  /*addtoObject() {
    if (this.selected_hour != undefined && this.selected_minute != undefined){
    var new_Date = new Date(this.generated_date.getFullYear(),this.generated_date.getMonth(), this.generated_date.getDate(),this.selected_hour, this.selected_minute)
    console.log(new_Date)
    this.new_objgroup.generated = new_Date.toISOString()
    console.log(this.new_objgroup.generated)
    }
    
  }*/

  addtoObject() {
    this.new_objgroup.generated = this.generated_date.toISOString()
    console.log(this.generated_date)
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
  createObject() {
    const dialogRef = this.dialog.open(CreateObjectComponent,
      {
        hasBackdrop: true,
        disableClose: true
      })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)
        this.new_objgroup.objects.push(result)
        this.object_table = new MatTableDataSource(this.new_objgroup.objects)
        this.isValid()
      } else {
        console.log("Dialog dismissed")
      }
    })
  }

  isValid() {
    this.requirements = []

    if (this.new_objgroup.name != "" &&
      this.new_objgroup.description != "" &&
      this.new_objgroup.objects.length != 0) {
      this.notValid = false
      this.requirements = []
    }
    else {
      this.notValid = true

      if (this.new_objgroup.name == "") {
        this.requirements.push(" Name")
      }
      if (this.new_objgroup.description == "") {
        this.requirements.push(" Description")
      }
      if (this.new_objgroup.objects.length == 0) {
        this.requirements.push(" Min. 1 Object")
      }

    }
  }

  addMetadata() {
    const dialogRef = this.dialog.open(MetadataAddComponent, {
      hasBackdrop: true,
      disableClose: true,
      width: 'auto',
      data: {}
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)
        this.new_objgroup.metadata.push({ metadata: JSON.stringify(result) })
        console.log(this.new_objgroup)
        this.metadata_html.push(result)
        this.meta_table = new MatTableDataSource(this.metadata_html)
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  viewMetadata(element) {

    const dialogRef = this.dialog.open(MetadataDetailsComponent, {
      hasBackdrop: true,
      data: element
    })
  }
  deleteMetadata(element) {
    //console.log(index)
    this.metadata_html.splice(this.metadata_html.indexOf(element), 1)
    this.new_objgroup.metadata.splice(this.new_objgroup.metadata.indexOf({ metadata: JSON.stringify(element) }), 1)
    this.meta_table = new MatTableDataSource(this.metadata_html)
    console.log(this.new_objgroup, this.metadata_html)
  }

}
