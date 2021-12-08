import { Component, OnInit, Inject } from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MetadataAddComponent } from '../metadata-add/metadata-add.component';
import { MetadataDetailsComponent } from '../metadata-details/metadata-details.component';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';


@Component({
  selector: 'app-create-project',
  templateUrl: './create-project.component.html',
  styleUrls: ['./create-project.component.scss']
})
export class CreateProjectComponent implements OnInit {

  new_project = {
    name: "",
    description:"",
    metadata: [],
    labels:[]
  }
  labelColumns: string[]
  label_table: any
  label = {
    key: "",
    value: ""
  }
  metaColumns: string[]
  meta_table: any
  metadata_html = []
  disabled = true
  disableAnimation = true;
  constructor(public dialog: MatDialog,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any) {
      this.labelColumns=["key", "value", "delete"]
      this.label_table = new MatTableDataSource(this.new_project.labels)
      this.metaColumns=["name", "actions"]
      this.label_table = new MatTableDataSource(this.metadata_html)
     }

  ngOnInit(): void {
  }
  /*submit(){
    console.log(this.new_project)
  }*/

  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

  validProject(){
    if(this.new_project.name != "" && this.new_project.description != ""){
      this.disabled= false
    } else {
      this.disabled = true
    }
  }

  addMetadata(){
    const dialogRef = this.dialog.open(MetadataAddComponent, {
      hasBackdrop: true,
      disableClose: true,
      width: 'auto',
      data: {}
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        this.new_project.metadata.push(JSON.stringify(result))
        console.log(this.new_project)
        this.metadata_html.push(result)
        this.meta_table = new MatTableDataSource(this.metadata_html)
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  viewMetadata(element){

    const dialogRef = this.dialog.open(MetadataDetailsComponent, {
      hasBackdrop: true,
      data: element
    })
  }
  deleteMetadata(element){
    //console.log(index)
    this.metadata_html.splice(this.metadata_html.indexOf(element), 1)
    this.new_project.metadata.splice(this.new_project.metadata.indexOf(JSON.stringify(element)), 1)
    this.meta_table = new MatTableDataSource(this.metadata_html)
    console.log(this.new_project, this.metadata_html)
  }
  addtoLabels() {
    var add = true
    for (let label_inObj of this.new_project.labels) {
      if (label_inObj.key == this.label.key) {
        add = false
      }
    }
    if (this.label.key != "" && this.label.value != "") {
      if (add) {
        this.new_project.labels.push(this.label)
        this.label = {
          key: "",
          value: ""
        }
        this.label_table = new MatTableDataSource(this.new_project.labels)
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
    const index: number = this.new_project.labels.indexOf(element)
    //console.log(index)
    this.new_project.labels.splice(index, 1)
    this.label_table = new MatTableDataSource(this.new_project.labels)
  }
}
