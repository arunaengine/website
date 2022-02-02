import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-alert-dialog',
  templateUrl: './alert-dialog.component.html',
  styleUrls: ['./alert-dialog.component.scss']
})
export class AlertDialogComponent implements OnInit {

  delete_input = ""
  delete_notallowed = true
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any
    
  ) {
    if (data.method != "delete_Project"){
      this.delete_notallowed = false
    }
   }

  ngOnInit(): void {
  }

  activate_delete(){
    if (this.delete_input == "DELETE"){
      this.delete_notallowed = false
    } else {
      this.delete_notallowed = true
    }
  }
}
