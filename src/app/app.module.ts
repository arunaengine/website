import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { MatToolbarModule } from '@angular/material/toolbar';
import {MatCardModule} from '@angular/material/card';
import {MatButtonModule} from '@angular/material/button';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatSortModule } from '@angular/material/sort';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import {MatInputModule} from '@angular/material/input';
import {MatDialogModule} from '@angular/material/dialog';
import { CreateProjectComponent } from './dialogs/create-project/create-project.component';
import { AlertDialogComponent } from './dialogs/alert-dialog/alert-dialog.component';
import { ProjectTokensComponent } from './dialogs/project-tokens/project-tokens.component';
import {MatIconModule} from '@angular/material/icon';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';
import {MatListModule} from '@angular/material/list';
import {ClipboardModule} from '@angular/cdk/clipboard';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { OAuthModule, OAuthStorage } from 'angular-oauth2-oidc';
import { AuthGuardService } from './services/auth-guard.service';
import { AuthService } from './services/auth.service';
import {MatPaginatorModule} from '@angular/material/paginator';
import { ConfigService } from './services/config.service';
import { of, Observable, ObservableInput } from '../../node_modules/rxjs';
import { map, catchError } from 'rxjs/operators';

function initialize(http: HttpClient, config: ConfigService) {
	return (): Promise<boolean> => {
    return new Promise<boolean>((resolve: (a: boolean) => void): void => {
      http.get("assets/config/config.json").pipe(
           map((x: any) => {
             //console.log(x)
             config.auth_config = x.auth_config;
             config.gateway_url = x.api_config.gateway_url
             console.log(config)
             resolve(true);
           }),
           catchError((x: { status: number }, caught: Observable<void>): ObservableInput<{}> => {
               resolve(false);
             return of({});
           })
         ).subscribe();
    });
  };
}
export function storageFactory() : OAuthStorage {
  return localStorage
}


@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    LoginComponent,
    CreateProjectComponent,
    AlertDialogComponent,
    ProjectTokensComponent,
    ProjectOverviewComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    FlexLayoutModule,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatSortModule,
    FormsModule,
    MatFormFieldModule,
    MatTableModule,
    MatInputModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatPaginatorModule,
    ClipboardModule,
    MatSnackBarModule,
    HttpClientModule,
    OAuthModule.forRoot()
  ],
  providers: [[{
    provide: APP_INITIALIZER,
    useFactory: initialize,
    deps: [
        HttpClient,
        ConfigService,
      ],
    multi: true
  }],AuthGuardService, AuthService,
    { provide: OAuthStorage, useFactory: storageFactory }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
