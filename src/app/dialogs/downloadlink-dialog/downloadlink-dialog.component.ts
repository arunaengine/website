import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-downloadlink-dialog',
  templateUrl: './downloadlink-dialog.component.html',
  styleUrls: ['./downloadlink-dialog.component.scss']
})
export class DownloadlinkDialogComponent implements OnInit {
  
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any
  ) { }

  ngOnInit(): void {
    console.log(this.data)
  }

}
