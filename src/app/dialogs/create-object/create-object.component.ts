import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-create-object',
  templateUrl: './create-object.component.html',
  styleUrls: ['./create-object.component.scss']
})
export class CreateObjectComponent implements OnInit {

  new_obj = {
    name: "",
    filetype: "",
    filename: "",
    labels: [],
    //metadata needs function
    metadata: [],
    contentLen: ""
  }
  fileToUpload: File | null = null;

  constructor() { }

  ngOnInit(): void {
  }

  handleFileInput(files) {
    console.log(files)
    //this.fileToUpload = files.item(0);
    //console.log(this.fileToUpload)
}
}
