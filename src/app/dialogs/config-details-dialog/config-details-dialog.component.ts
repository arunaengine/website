import { Component, OnInit } from '@angular/core';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-config-details-dialog',
  templateUrl: './config-details-dialog.component.html',
  styleUrls: ['./config-details-dialog.component.scss']
})
export class ConfigDetailsDialogComponent implements OnInit {

  constructor(
    public configService: ConfigService
  ) { }

  ngOnInit(): void {
  }

  goToLink(url: string){
    window.open(url, "_blank");
}
}
