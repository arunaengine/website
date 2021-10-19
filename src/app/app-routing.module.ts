import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';
import { AuthGuardService } from './services/auth-guard.service';

const routes: Routes = [
  {path:"login", component:LoginComponent},
  
  {path: "home", component:HomeComponent, },
  {path:"project_overview", component:ProjectOverviewComponent,canActivate: [AuthGuardService]},
//, canActivate: [AuthGuardService]
  {path: "", redirectTo:"login", pathMatch:"full"},
  {path: "auth-callback", redirectTo: "home", pathMatch:"full"}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
