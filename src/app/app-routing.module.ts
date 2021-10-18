import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { ProjectOverviewComponent } from './project-overview/project-overview.component';

const routes: Routes = [
  {path: "home", component:HomeComponent},
  {path:"login", component:LoginComponent},
  {path:"project_overview", component:ProjectOverviewComponent},

  {path: "", redirectTo:"home", pathMatch:"full"}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
