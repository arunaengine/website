import { Component, OnInit, Inject } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { ApiService } from 'src/app/services/api.service';

@Component({
  selector: 'app-details-dialog',
  templateUrl: './details-dialog.component.html',
  styleUrls: ['./details-dialog.component.scss']
})
export class DetailsDialogComponent implements OnInit {

  label_table: any
  labelColumns: string[]
  object_table: any
  objectColumns: string[]

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private snackBar: MatSnackBar,
    private apiService: ApiService,
    private dialog: MatDialog

  ) {
    console.log(data)
    this.labelColumns = ["key", "value"]
    this.label_table = new MatTableDataSource(this.data.labels)
    this.objectColumns = ["filename", "filetype", "created", "filesize", "actions"]
    this.object_table = new MatTableDataSource(this.data.objects)
  }

  ngOnInit(): void {
  }

  openSnackBar() {
    this.snackBar.open("ID copied to Clipboard.", "", {
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }

  downloadObject(element) {
    console.log("downloadObject")
  }

  viewObjectDetails(element) {
    console.log("See Object...", element)


    Object.assign(element, { type: "Object", name: element.filename + "." + element.filetype })
    
    const dialogRef = this.dialog.open(DetailsDialogComponent, {
      data: element,
      hasBackdrop: true
    })

  }
}
