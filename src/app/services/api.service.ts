import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders } from '@angular/common/http';
import { OAuthService } from 'angular-oauth2-oidc';
import { ConfigService } from './config.service';
import * as moment from 'moment';
import * as FileSaver from 'file-saver';
import { BehaviorSubject } from 'rxjs';



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
  public paginantor_config = {stats: {groupscount: 0, objectscount: 0}, lastIds: [], pagesize:250, pagecount:0, activepage:0}
  
  //global vars for multipart upload
  chunksize = 15000000
  threadsQuantity = 5
  //threadsQuantity_ls =[]
  //chunksQuantity = 0
  chunksQuantity_ls = []
  //chunksQueue = new Array()
  chunksQueue_ls = []
  //activeConnections = 0
  activeConnections_ls = []
  multipart_res_ls = []
  multipart_progress_ls = []
  //file: File
  public multipart_loaded = []
  constructor(
    private http: HttpClient,
    private oauthService: OAuthService,
    private configService: ConfigService,
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
      console.log(this.paginantor_config)
      var post_object = { id: element.id, pageRequest: {lastUuid:"", pageSize:this.paginantor_config.pagesize.toString()} }
      if (this.paginantor_config.activepage > 0){
        post_object.pageRequest.lastUuid = this.paginantor_config.lastIds[this.paginantor_config.activepage-1]
      }
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

  getObjectGroupPagination(element){
    return new Promise(resolve => {
      var post_obj = { id: element.id}
      this.http.post(this.gateway_url + "/dataset/list", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        
        this.paginantor_config.stats.groupscount=res["objectGroups"].length
        this.paginantor_config.stats.objectscount = 0
        this.paginantor_config.pagecount= Math.ceil(this.paginantor_config.stats.groupscount / this.paginantor_config.pagesize)
        this.paginantor_config.lastIds = []
        this.paginantor_config.activepage = 0
        for (let [i,group] of res["objectGroups"].entries()){
          this.paginantor_config.stats.objectscount += group["objects"].length
          if (i%this.paginantor_config.pagesize == this.paginantor_config.pagesize-1){
            console.log("last element", i, group)
            this.paginantor_config.lastIds.push(group.id)
          }
        }
        console.log(this.paginantor_config)
        resolve("")
      })
    })
  }
 /* viewSelectedObjectGroups(dataset_id,start_date, end_date){
    return new Promise(resolve => {
      var post_object = { id: dataset_id, start:start_date, end:end_date }
      console.log(post_object)
      this.http.post(this.gateway_url + "/objectgroupsindaterange/query", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("daterange",res)
        this.formatObjGroup(res["objectGroups"]).then(_ => {
          resolve("")
        })
        //this.obj_groups = res["objectGroups"]       
      })
    })
  }*/

  formatObjGroup(data: any){
    return new Promise(resolve => {
      var new_data = data.map(v => Object.assign(v,{isExpanded: false, objectcount: v["objects"].length, objects: v.objects.map(o => Object.assign(o, {contentLen: o["contentLen"].replace(/\B(?=(\d{3})+(?!\d))/g, ".")}))}))
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
    data.append("file",file)
    var headers = this.configureHeadersAccessKey()
    headers["reportProgress"] = true
    headers["observe"]="events"
    return this.http.put(url, file, headers).pipe()
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

  downloadSingleObject(object){
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/objectload/download/" + object.id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.http.get(res_added["downloadLink"],{responseType:"blob"}).subscribe(res_dl => {
          FileSaver.saveAs(res_dl, object.filename+"."+object.filetype)
        })
          //window.open(res_added["downloadLink"])
          resolve("done")
        
      })
    })
  }

  downloadObjectGroup(group_id){
    return new Promise(resolve => {
      var post_obj = {streamType: "STREAM_TYPE_TARGZ", dataset: {datasetId: this.dataset.id}}
      //post_obj.groupIds.objectGroups.push(group_id)
      console.log(post_obj)
      ///launch dialog -> link copy
      
      this.http.post(this.gateway_url + "/objectgroupsstream", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("Object Group Response",res)
        resolve(res)
        //FileSaver.saveAs(data, filename)
        
        window.open(res["url"])
        
      })
    })
  }

  downloadObjectGroupNew(group){
    console.log(group)
    for (let object of group.objects){
      console.log(object)
      this.http.get(this.gateway_url + "/objectload/download/" + object.id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
      console.log(res_added)
      this.http.get(res_added["downloadLink"],{responseType:"blob"}).subscribe(res_dl => {
        FileSaver.saveAs(res_dl, object.filename +"."+object.filetype)
      })
    })
    }
  }

  /*saveFile(data){
    const blob = new Blob([data], {type: "application/json"})
    const url = window.URL.createObjectURL(blob)
    window.open(url)
  }
  saveFilePerHand(data){
    const a = document.createElement("a")
        const objectUrl = URL.createObjectURL(data)
        a.href = objectUrl
        a.download = "test.json"
        a.click()
        URL.revokeObjectURL(objectUrl)
  }
  saveFileFileSaver(data){
    FileSaver.saveAs(data, "test.json")
  }*/

  initMultipartUpload(object_id){
    return new Promise ( resove => {
      var post_obj = {id: object_id}
      this.http.post(this.gateway_url+"/objectload/init_multipart/"+object_id, post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res_uploadLink => {
        console.log("initMultipart: ", res_uploadLink)
        resove("")
      })
    })
  }
  initMultipartuploadPart(){
    //Get upload_multipart_part/{object_id}/{chunkId} --> res["uploadlink"] --> Put uploadMultipartPart()
  }
  //chunk, uploadpart, url
  uploadMultipartPart(chunk, chunkId, objectid, index){
    return new Promise(resolve => {
      console.log("Init Upload Part: ",chunkId)
      //this.multipart_progress_ls[index].push({chunkid: chunkId, loaded: 0, total:0})
      //initMultipartuploadPart() -> put Request
      this.http.get(this.gateway_url+"/objectload/upload_multipart_part/"+objectid+"/"+chunkId, this.configureHeadersAccessKey()).pipe().subscribe(res_url => {
        console.log(res_url)
        var options = this.configureHeadersAccessKey()
        options["reportProgress"] = true
        options["observe"]="events"
        console.log("Uploading",chunk, chunkId, options)
        this.http.put(res_url["uploadLink"], chunk, options).pipe().subscribe((event: HttpEvent<any>) => {
          //console.log(res_upload)
          switch (event.type){
            case HttpEventType.UploadProgress:
            //do something
            this.multipart_progress_ls[index][chunkId] = event.loaded
            //console.log("Chunk ", chunkId, " uploaded ", event.loaded/event.total, "%") 
            this.getProgress(index)
            break;
            case HttpEventType.Response:
        console.log("PUT Response:",chunkId, event)
                    this.multipart_res_ls[index].push({etag: event["headers"].get("etag"), part: chunkId})
                    resolve("")
              break;
          }
         /* if (res_upload["type"] == 4){
            
          }*/
        })
      })
      //Resolve ist server hat request bekommen http progess event ->  HttpEventType.Sent
      //Resolve -> push part, etag to part_ls
      
    })
  }

  getProgress(index){
    var uploaded_progress = 0
    for (let chunk in this.multipart_progress_ls[index]){
      uploaded_progress += this.multipart_progress_ls[index][chunk]
    }
    this.multipart_loaded[index].next(uploaded_progress)
  }

  completeMultipartUpload(object_id, part_ls){
    // part_ls = [{etag: "", part: ""}]
    console.log(part_ls)
    var post_obj={objectId: object_id, parts: part_ls}
    this.http.post(this.gateway_url+ "/objectload/complete_multipart", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
    })
  }

  fullMultipattUpload(object, index){
   
    this.chunksQuantity_ls[index]  = Math.ceil(object.file.size / this.chunksize)
    
    for (let i=1; i <= this.chunksQuantity_ls[index]; i++){this.chunksQueue_ls[index].push(i)}
    this.chunksQueue_ls[index].reverse()
    this.sendNext(object, index)
    
  }

  sendNext(object, index){

    if (this.activeConnections_ls[index] >= this.threadsQuantity){
      console.log("too many threads")
      return
    }

    if(!this.chunksQueue_ls[index].length){
      console.log("All parts in upload")
      if (this.activeConnections_ls[index] == 0){
        console.log("Multipart Upload FINISHED File:", object.file.name)
        //complete Multipart
        
        this.completeMultipartUpload(object.uploadParams.id, this.multipart_res_ls[index])
      }
      return
    }

    const chunkId = this.chunksQueue_ls[index].pop()
    const begin = (chunkId-1) * this.chunksize
    const chunk = object.file.slice(begin, begin + this.chunksize)
    this.activeConnections_ls[index] += 1
    
    this.uploadMultipartPart(chunk, chunkId, object.uploadParams.id, index).then(()=> {
      this.activeConnections_ls[index] -= 1
      console.log("reduced thread")
      this.sendNext(object, index)
    })

    this.sendNext(object, index)
  }

}
