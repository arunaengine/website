import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-details-dialog',
  templateUrl: './details-dialog.component.html',
  styleUrls: ['./details-dialog.component.scss']
})
export class DetailsDialogComponent implements OnInit {

  label_table: any
  labelColumns: string[]

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private snackBar: MatSnackBar
    
  ) { 
    console.log(data)
    this.labelColumns=["key", "value"]
    this.label_table = new MatTableDataSource(this.data.labels)
  }

  ngOnInit(): void {
  }

  openSnackBar(){
    this.snackBar.open("ID copied to Clipboard.","",{
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
}
