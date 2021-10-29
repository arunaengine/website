import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders } from '@angular/common/http';
import { OAuthService } from 'angular-oauth2-oidc';
import { ConfigService } from './config.service';
import * as moment from 'moment';


@Injectable({
  providedIn: 'root'
})

export class ApiService {
  gateway_url = ""
  public projects: any
  public apiKeys: any
  public project = { project: {}, datasets: [] }
  public users: any
  public dataset: any
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
      this.http.get(this.gateway_url + "/project/" + projcet_id + "/delete", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("done")
      })
    })
  }

  viewSingleProject(id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + id, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.project.project = res["project"]
        resolve("done")
      })
    })
  }
  getDatasetsforProject(id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + id + "/projectdatasets", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.project.datasets = res["dataset"]
        resolve("done")
      })
    })
  }


  addUsertoProject(user_id) {
    return new Promise(resolve => {
      var post_object = { user_id: user_id, scope: ["READ", "WRITE"], projectId: this.project.project["id"] }
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
        this.getApiKeys().then(() => {
          resolve("")
        })

      })
    })
  }

  createDataset(name, description) {
    return new Promise(resolve => {
      var post_object = { name: name, desription: description, projectId: this.project.project["id"], metadata: [], labels: [] }
      this.http.post(this.gateway_url + "/dataset/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("")
      })
    })

  }

  deleteDataset(dataset_id) {
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

  viewObjectGroups(element) {
    return new Promise(resolve => {
      var post_object = { id: element.id }
      this.http.post(this.gateway_url + "/dataset/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.formatObjGroup(res["objectGroups"]).then(_ => {
          resolve("")
        })
        //this.obj_groups = res["objectGroups"]
        this.dataset = element
        
      })
    })
  }
  formatObjGroup(data: any){
    return new Promise(resolve => {
      var new_data = data.map(v => Object.assign(v,{isExpanded: false, objectcount: v["objects"].length}))
      console.log(new_data)
      this.obj_groups = new_data
      resolve("")
    })
  }
  createObjectGroup(dataset_id, new_objgroup) {
    return new Promise(resolve => {
      var post_object = new_objgroup
      post_object["datasetId"]= dataset_id
      post_object["includeObjectLink"]= true
      post_object.generated = moment(post_object.generated).toISOString()
      console.log(post_object)
      this.http.post(this.gateway_url + "/objectgroup/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("Create Object Response",res)
        resolve(res)
      })
    })
  }
  uploadFile(url, file){
    console.log(url, file)
    var data = new FormData()
    data.append(file.name.split("."[0]),file)
    var headers = this.configureHeadersAccessKey()
    headers["reportProgress"] = true
    headers["observe"]="events"
    
    return this.http.put(url, data, headers).pipe()
  }
  deleteObjectGroup(objectgroup_id){
    console.log(objectgroup_id)
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/objectgroup/" + objectgroup_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        resolve("done")
      })
    }) 
  }

  downloadSingleObject(object_id){
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/objectload/download/" + object_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
          window.open(res_added["downloadLink"])
          resolve("done")
        
      })
    })
  }
}
