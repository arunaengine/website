import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CreateObjectComponent } from '../create-object/create-object.component';
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
  generated_date: any
  label = {
    key: "",
    value: ""
  }
  constructor(private snackBar: MatSnackBar, private dialog: MatDialog) { }

  ngOnInit(): void {
  }
  logME() {
    console.log(this.new_objgroup, this.generated_date)
  }
  addtoObject() {
    this.new_objgroup.generated = this.generated_date
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
  deleteLabel(index) {
    this.new_objgroup.labels.splice(index, 1)
  }
  createObject(){
    const dialogRef = this.dialog.open(CreateObjectComponent,
      {hasBackdrop: true,
      disableClose: true
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
