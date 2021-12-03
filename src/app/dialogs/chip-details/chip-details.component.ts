import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-chip-details',
  templateUrl: './chip-details.component.html',
  styleUrls: ['./chip-details.component.scss']
})
export class ChipDetailsComponent implements OnInit {

  labelColumns: string[]
  objectTable: any
  disableAnimation = true;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    console.log(this.data)
    this.labelColumns = ["filename", "filetype", "filesize"]
    this.objectTable = new MatTableDataSource(this.data.group.objects)
   }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

}
