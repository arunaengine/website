import { Component, OnInit, Inject } from '@angular/core';
import {MatDialog} from '@angular/material/dialog';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MetadataAddComponent } from '../metadata-add/metadata-add.component';
import { MetadataDetailsComponent } from '../metadata-details/metadata-details.component';


@Component({
  selector: 'app-create-project',
  templateUrl: './create-project.component.html',
  styleUrls: ['./create-project.component.scss']
})
export class CreateProjectComponent implements OnInit {

  new_project = {
    name: "",
    description:"",
    metadata: []
  }
  metadata_html = []
  disabled = true
  constructor(public dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: any) { }

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
        this.new_project.metadata.push(JSON.stringify(result).replace(/\\/g, ""))
        console.log(this.new_project)
        this.metadata_html.push(result)
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
}
