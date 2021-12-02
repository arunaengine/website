import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-chip-details',
  templateUrl: './chip-details.component.html',
  styleUrls: ['./chip-details.component.scss']
})
export class ChipDetailsComponent implements OnInit {

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    console.log(this.data)
   }

  ngOnInit(): void {
  }

}
