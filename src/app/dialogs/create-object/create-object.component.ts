
import { Component, OnInit } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MetadataAddComponent } from '../metadata-add/metadata-add.component';
import {MatDialog} from '@angular/material/dialog';
import { MetadataDetailsComponent } from '../metadata-details/metadata-details.component';



@Component({
  selector: 'app-create-object',
  templateUrl: './create-object.component.html',
  styleUrls: ['./create-object.component.scss']
})
export class CreateObjectComponent implements OnInit {

  new_obj = {
    // name: "",
    filetype: "",
    filename: "",
    labels: [],
    //metadata needs function
    metadata: [],
    contentLen: 0,
    uploaded: false
  }

  isnotValid= true
  file: File | null = null;
  file_name: string

  labelColumns: string[]
  label_table: any
  label = {
    key: "",
    value: ""
  }
  metaColumns: string[]
  meta_table: any
  metadata_html = []
  disableAnimation = true;
  constructor(
    public dialog: MatDialog,
    private snackBar: MatSnackBar,) {
    this.labelColumns=["key", "value", "delete"]
    this.label_table = new MatTableDataSource(this.new_obj.labels)
    this.metaColumns=["name", "actions"]
    this.meta_table = new MatTableDataSource(this.metadata_html)

   }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

  onFileInput(files: FileList | null) {
    console.log(files)
    if (files) {
      this.file = files[0]
      console.log(this.file)
      this.file_name = this.file.name
      this.new_obj.uploaded = true
      this.new_obj["file"]= this.file
      if (this.new_obj.filename == "") {
        this.new_obj.filename = this.file_name.split(".")[0]
      }
      // if (this.new_obj.name == "") {
      //   this.new_obj.name = this.file_name.split(".")[0]
      // }
      if (this.new_obj.filetype == "") {
        this.new_obj.filetype = this.file_name.split(".")[this.file_name.split(".").length - 1]
      }
      
      this.new_obj.contentLen = this.file.size
      
      this.isNotValid()
      //this.apiService.uploadDummyFile(this.file)
    }
  }

  isNotValid(){
    if (this.new_obj.filename != "" && this.new_obj.filetype != "" && this.new_obj.contentLen !=0){
      this.isnotValid = false
    } else {
      this.isnotValid = true
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
        this.new_obj.metadata.push({metadata: JSON.stringify(result)})
        console.log(this.new_obj)
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
    this.new_obj.metadata.splice(this.new_obj.metadata.indexOf({metadata: JSON.stringify(element)}), 1)
    this.meta_table = new MatTableDataSource(this.metadata_html)
    console.log(this.new_obj, this.metadata_html)
  }
  addtoLabels() {
    var add = true
    for (let label_inObj of this.new_obj.labels) {
      if (label_inObj.key == this.label.key) {
        add = false
      }
    }
    if (this.label.key != "" && this.label.value != "") {
      if (add) {
        this.new_obj.labels.push(this.label)
        this.label = {
          key: "",
          value: ""
        }
        this.label_table = new MatTableDataSource(this.new_obj.labels)
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
    const index: number = this.new_obj.labels.indexOf(element)
    //console.log(index)
    this.new_obj.labels.splice(index, 1)
    this.label_table = new MatTableDataSource(this.new_obj.labels)
  }


}
