import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { CreateObjgroupComponent } from '../dialogs/create-objgroup/create-objgroup.component';

@Component({
  selector: 'app-anonymous-upload',
  templateUrl: './anonymous-upload.component.html',
  styleUrls: ['./anonymous-upload.component.scss']
})
export class AnonymousUploadComponent implements OnInit {
  query_content: any
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) {
    this.route.queryParams.subscribe(params => {
      if (params.action == undefined){
        this.router.navigate(["/login"])
      }
      if (params.name == undefined){
        this.router.navigate(["/login"])
      }
      if (params.link == undefined){
        this.router.navigate(["/login"])
      }
      if (params.id == undefined){
        this.router.navigate(["/login"])
      }
      if (params.description == undefined){
        this.router.navigate(["/login"])
      }
      this.query_content= params
      console.log(params)
    })
   }

  ngOnInit(): void {
  }

  createObjectGroup() {
    const dialogRef = this.dialog.open(CreateObjgroupComponent,
      {
        hasBackdrop: true,
        disableClose: true
      })
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log("Dialog closed: ", result)
      } else {

        console.log("Dialog dismissed")
      }
    })
  }
}
