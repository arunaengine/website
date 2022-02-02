import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AnonymousUploadComponent } from './anonymous-upload/anonymous-upload.component';
import { GroupsOverviewComponent } from './groups-overview/groups-overview.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';
import { AuthGuardService } from './services/auth-guard.service';
import { VersionOverviewComponent } from './version-overview/version-overview.component';

const routes: Routes = [
  {path:"login", component:LoginComponent},
  {path: "home", component:HomeComponent,canActivate: [AuthGuardService] },
  {path:"dataset_overview", component:ProjectOverviewComponent,canActivate: [AuthGuardService]},
  {path: "group_overview", component: GroupsOverviewComponent, canActivate: [AuthGuardService]},
  {path: "version_overview", component: VersionOverviewComponent, canActivate: [AuthGuardService]},
  {path: "anonymous_upload", component: AnonymousUploadComponent},
  {path: "", redirectTo:"login", pathMatch:"full"},
  {path: "auth-callback", redirectTo: "login", pathMatch:"full"},
  {path: "**", redirectTo:"home"}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
