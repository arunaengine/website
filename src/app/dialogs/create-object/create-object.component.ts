
import { Component, OnInit } from '@angular/core';
import { ApiService } from 'src/app/services/api.service';

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
    contentLen: 0,
    uploaded: false
  }

  isnotValid= true
  file: File | null = null;
  file_name: string
  constructor(private apiService: ApiService) { }

  ngOnInit(): void {
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
      if (this.new_obj.filetype == "") {
        this.new_obj.filetype = this.file_name.split(".")[this.file_name.split(".").length - 1]
      }
      if (this.new_obj.contentLen == 0) {
        this.new_obj.contentLen = this.file.size
      }
      this.isNotValid()
      //this.apiService.uploadDummyFile(this.file)
    }
  }

  isNotValid(){
    if (this.new_obj.name != "" && this.new_obj.filename != "" && this.new_obj.filetype != "" && this.new_obj.contentLen !=0){
      this.isnotValid = false
    } else {
      this.isnotValid = true
    }
  }

}
