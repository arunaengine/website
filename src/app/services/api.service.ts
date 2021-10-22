import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { OAuthService } from 'angular-oauth2-oidc';


@Injectable({
  providedIn: 'root'
})

export class ApiService {
  gateway_url = "https://gateway.core-server-dev.m1.k8s.computational.bio/api/v1"
  public projects: any
  public apiKeys: any

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private oauthService: OAuthService
  ) {
    this.projects = []
  }

  configureHeadersAccessKey() {
    return {
      headers: new HttpHeaders({
        "Grpc-Metadata-accesskey": this.oauthService.getAccessToken(),
        "Grpc-Metadata-API_TOKEN": "mP0JFfX1OR2h+h6YID85X2jUrLxkXf1/0JnT1G1XKUFzaiET6ngHNr4E0Mrq"
      })
    }
  }


  getProjects() {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/projects", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("Get Projects...", res)
        this.projects = res["projects"]
        resolve("done")
      })
    })
  }

  createProject() {
    //console.log(this.oauthService.getIdentityClaims())
    var post_object = { name: "dummy", desription: "just a dummy project", metadata: [], labels: [] }
    this.http.post(this.gateway_url + "/project/createproject", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
    })
  }

  deleteProject(projcet_id) {
    this.http.get(this.gateway_url + "/project/" + projcet_id + "/delete", this.configureHeadersAccessKey() ).pipe().subscribe(res => {
      console.log(res)
    })
  }


  //Functions for apiKey handling
  getApiKeys() {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/apitoken", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.apiKeys = res["token"]
        resolve("done")
      })
    })
  }

  createApiKey(project_id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/createapitoken?id=" + project_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.getApiKeys().then(() => {
          resolve("done")
        })

      })
    })
  }

  deleteApiKey(token_id) {
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/apitoken/" + token_id + "/delete", this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
      })
    })
  }
}
