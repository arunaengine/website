import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-chip-details',
  templateUrl: './chip-details.component.html',
  styleUrls: ['./chip-details.component.scss']
})
export class ChipDetailsComponent implements OnInit {
  objectColumns: string[]
  labelColumns: string[]
  objectTable: any
  label_table: any
  disableAnimation = true;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    console.log(this.data)
    this.objectColumns = ["filename", "filetype", "filesize"]
    this.objectTable = new MatTableDataSource(this.data.group.objects)
    this.labelColumns = ["key", "value"]
    this.label_table = new MatTableDataSource(this.data.group.labels)
   }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

}
