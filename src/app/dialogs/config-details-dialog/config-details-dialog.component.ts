import { Component, OnInit } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-config-details-dialog',
  templateUrl: './config-details-dialog.component.html',
  styleUrls: ['./config-details-dialog.component.scss']
})
export class ConfigDetailsDialogComponent implements OnInit {

  constructor(
    public configService: ConfigService,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
  }

  goToLink(url: string) {
    window.open(url, "_blank");
  }
  openSnackBar() {
    this.snackBar.open("ID copied to Clipboard.", "", {
      duration: 3000,
      panelClass: ["success-snackbar"]
    })
  }
}
