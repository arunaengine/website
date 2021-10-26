import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
//import {MatDatepickerModule} from '@angular/material/datepicker';

@Component({
  selector: 'app-create-objgroup',
  templateUrl: './create-objgroup.component.html',
  styleUrls: ['./create-objgroup.component.scss']
})
export class CreateObjgroupComponent implements OnInit {
  disabled = true
  new_objgroup= {
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
  label= {
    key: "",
    value: ""
  }
  constructor(private snackBar: MatSnackBar) { }

  ngOnInit(): void {
  }
  logME(){
    console.log(this.new_objgroup, this.generated_date)
  }
  addtoLabels(){
    if (this.label.key!="" && this.label.value!=""){
      this.new_objgroup.labels.push(this.label)
    this.label = {
      key: "",
      value: ""
    }
    }else {
      this.snackBar.open("Key or Value can't be empty.","",{
        duration: 3000,
        panelClass: ["warning-snackbar"]
      })
    }
    
  }
}
