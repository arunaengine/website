import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { OAuthService } from 'angular-oauth2-oidc';
import { ConfigService } from './config.service';


@Injectable({
  providedIn: 'root'
})

export class ApiService {
  gateway_url = ""
  public projects: any
  public apiKeys: any
  public project = {project: {}, datasets: []}
  public users: any
  public obj_groups: []

  constructor(
    private http: HttpClient,
    private oauthService: OAuthService,
    private configService: ConfigService
  ) {
    this.gateway_url = this.configService.gateway_url
    this.projects = []
  }

  configureHeadersAccessKey() {
    return {
      headers: new HttpHeaders({
        "Grpc-Metadata-accesstoken": this.oauthService.getAccessToken(),
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

  createProject(name, description) {
    //console.log(this.oauthService.getIdentityClaims())
    return new Promise(resolve => {
      var post_object = { name: name, desription: description, metadata: [], labels: [] }
          this.http.post(this.gateway_url + "/project/createproject", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
            console.log(res)
            resolve("")
          })
    })
    
  }

  deleteProject(projcet_id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + projcet_id + "/delete", this.configureHeadersAccessKey() ).pipe().subscribe(res => {
      console.log(res)
      resolve("done")
    })
    })
  }

  viewSingleProject(id){
    return new Promise(resolve => {
      this.http.get(this.gateway_url +"/project/"+ id, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.project.project = res["project"]
        resolve("done")
      })
    })
  }
  getDatasetsforProject(id){
    return new Promise(resolve => {
      this.http.get(this.gateway_url +"/project/"+ id+"/projectdatasets", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.project.datasets = res["dataset"]
        resolve("done")
      })
    })
  }


  addUsertoProject(user_id){
    return new Promise(resolve => {
      var post_object = { user_id: user_id, scope: ["READ", "WRITE"], projectId: this.project.project["id"]}
    this.http.post(this.gateway_url + "/project/addusertoproject", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
      resolve("")
    })
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
        this.getApiKeys().then(()=> {
          resolve("")
        })
        
      })
    })
  }

  createDataset(name, description){
    return new Promise(resolve => {
      var post_object = { name: name, desription: description, projectId: this.project.project["id"], metadata: [], labels: [] }
    this.http.post(this.gateway_url + "/dataset/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
      resolve("")
    })
    })
    
  }

  deleteDataset(dataset_id){
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/dataset/" + dataset_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        resolve("done")
      })
    })
  }

  getDetails(dataset_id) {
    return new Promise(resolve => {
      var post_object = { id: dataset_id }
    this.http.post(this.gateway_url + "/dataset/get", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      //console.log(res)
      resolve(res)
    })
    })
  }

  /*viewDatasetVersion(dataset_id){
    return new Promise(resolve => {
      var post_object = { id: dataset_id }
    this.http.post(this.gateway_url + "/datasetversion/get", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
      resolve(res)
    })
    })
  }*/

  viewObjectGroups(dataset_id){
    return new Promise(resolve => {
      var post_object = { id: dataset_id }
    this.http.post(this.gateway_url + "/dataset/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
      this.obj_groups = res["objectGroups"]
      resolve("")
    })
    })
  }

}
