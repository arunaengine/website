import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import * as xmlParser from "xml-js"
import * as YAML from 'yamljs';
import * as csvParser from "csvtojson";



@Component({
  selector: 'app-metadata-add',
  templateUrl: './metadata-add.component.html',
  styleUrls: ['./metadata-add.component.scss']
})
export class MetadataAddComponent implements OnInit {
  file_type = ".json"
  input_type= "file"
  meta_data_string: any
  metadata= {name: "", metadata: {}}
  file: File | null
  file_name: string
  file_content: any
  addnotallowed: boolean = true
  constructor(
    @Inject(MAT_DIALOG_DATA) public data:any,
    public dialog: MatDialog,
  ) { }

  ngOnInit(): void {
  }

  onFileInput(files: FileList | null) {
    if (files) {
      this.file = files[0]
      this.file_name = this.file.name
      this.file_type = "."+this.file.name.split(".")[this.file.name.split(".").length-1] 
      console.log(this.file, this.file_type)
      this.readFileasString().then(_ => {
        this.convertMetadata()
      })
      
    } 
  }
  convertYAML(){
    console.log(this.meta_data_string)
    this.metadata.metadata = YAML.parse(this.meta_data_string)
  }
  convertJSON(){
    this.metadata.metadata = JSON.parse(this.meta_data_string)
  }

  convertXML(){
    this.metadata.metadata = JSON.parse(xmlParser.xml2json(this.meta_data_string, {compact: true, spaces: 4}))
  }

  convertCSV(){
    console.log(this.meta_data_string)
  //{delimiter: ";"} as var
    csvParser().fromString(this.meta_data_string).then((res => {
      this.metadata.metadata = res
      console.log(this.metadata)
      this.validate()
  }))
} 
  
  readFileasString(){
    return new Promise( resolve => {
      let fileReader = new FileReader();
    fileReader.onload = (e) => {
      this.meta_data_string = fileReader.result
      console.log(this.meta_data_string)
      resolve("")
    }
    fileReader.readAsText(this.file);
    })
  }
  convertMetadata(){
    
    if (this.file_type == ".json"){
      this.convertJSON()

    }
    if (this.file_type == ".yaml"){
      this.convertYAML()

    }
    if (this.file_type == ".xml"){
      this.convertXML()

    }
    console.log(this.metadata)
    if (this.file_type == ".csv"){
      this.convertCSV()
    }
    this.validate()
  }
  validate(){
    if (this.metadata.name != "" && Object.keys(this.metadata.metadata).length != 0){
      this.addnotallowed = false
    } else {
      this.addnotallowed = true
    }
  }
}
