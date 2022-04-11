import { Injectable } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpHeaders } from '@angular/common/http';
import { OAuthService } from 'angular-oauth2-oidc';
import { ConfigService } from './config.service';
import { MatDialog } from '@angular/material/dialog';
import * as moment from 'moment';
import * as FileSaver from 'file-saver';
import { ErrorDialogComponent } from '../dialogs/error-dialog/error-dialog.component';




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
  public datasetVersions: any
  public obj_groups: []
  public paginantor_config = { stats: { groupscount: 0, objectscount: 0 }, lastIds: [], pagesize: 250, pagecount: 0, activepage: 0 }
  public paginantor_config_versions = { stats: { groupscount: 0, objectscount: 0 }, lastIds: [], pagesize: 250, pagecount: 0, activepage: 0 }

  //global vars for multipart upload
  chunksize = 15000000
  threadsQuantity = 5
  chunksQuantity_ls = []
  chunksQueue_ls = []
  activeConnections_ls = []
  multipart_res_ls = []
  multipart_progress_ls = []
  multipart_loaded = []

  constructor(
    private http: HttpClient,
    private oauthService: OAuthService,
    private configService: ConfigService,
    private dialog: MatDialog,
  ) {
    this.gateway_url = this.configService.gateway_url
    this.projects = []
  }

  //Creates and retruns a http header with the access token included
  configureHeadersAccessKey() {
    return {
      headers: new HttpHeaders({
        "Grpc-Metadata-accesstoken": this.oauthService.getAccessToken(),
      })
    }
  }

  openErrorDialog(error_message) {
    const dialogRef = this.dialog.open(ErrorDialogComponent, {
      data: {
        title: "A Problem occured, Error-Code: " + error_message.status,
        code_message: error_message.error.message,
        message: error_message.message.split(": " + error_message.status)[0]
      },
      //panelClass: "warning-snackbar",
      hasBackdrop: true
    })
  }


  //Executes a http get request to get all projects
  getProjects() {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/projects", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("Get Projects...", res)
        this.projects = res["projects"]
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http post request to create a new project
  createProject(new_project) {
    return new Promise(resolve => {
      var post_object = { name: new_project.name, description: new_project.description, metadata: new_project.metadata, labels: new_project.labels }
      console.log(post_object)
      this.http.post(this.gateway_url + "/project/createproject", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })

  }

  //Executes a http get request to delete a project
  deleteProject(projcet_id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + projcet_id + "/delete", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http get request to get details of a project and returns them
  viewSingleProject(id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + id, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.project.project = res["project"]
        var formated_project = res["project"]

        Object.assign(formated_project,{formated_avg: this.formatNumber(formated_project.stats.avgObjectSize), formated_acc: this.formatNumber(formated_project.stats.accSize)})

        console.log(formated_project)
        resolve(formated_project)
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Rounds Size Numbers and add suitable units
  formatNumber(numberToFormat) {
    var rounded_numberToFormat = Math.round(numberToFormat)
    var rounded_numberToFormat_len = rounded_numberToFormat.toString().length

    console.log(rounded_numberToFormat)
    console.log(rounded_numberToFormat_len)

    if (rounded_numberToFormat_len < 4) {
      var unit = "Bytes"
    }
    else if (rounded_numberToFormat_len >= 4 && rounded_numberToFormat_len < 7) {
      rounded_numberToFormat = rounded_numberToFormat / 1000
      var unit = "Kilobytes"
    }
    else if (rounded_numberToFormat_len >= 7 && rounded_numberToFormat_len < 10) {
      rounded_numberToFormat = rounded_numberToFormat / 1000000
      var unit = "Megabytes"
    }
    else if (rounded_numberToFormat_len >= 10 && rounded_numberToFormat_len < 13) {
      rounded_numberToFormat = rounded_numberToFormat / 1000000000
      var unit = "Gigabytes"
    }
    else if (rounded_numberToFormat_len >= 13 && rounded_numberToFormat_len < 16) {
      rounded_numberToFormat = rounded_numberToFormat / 1000000000000
      var unit = "Terabytes"
    }

    var rounded_numberToFormat = Math.round((rounded_numberToFormat) * 100) / 100
    console.log(rounded_numberToFormat, unit)

    return rounded_numberToFormat.toString() + " " + unit
  }


  // Executes a http get request to get the datasets for a project
  getDatasetsforProject(id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/project/" + id + "/projectdatasets", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        var formated_res = res["datasets"].map(v => Object.assign(v, {
          status: v.status.split("_")[1].toLowerCase().charAt(0).toUpperCase()
            + v.status.split("_")[1].toLowerCase().slice(1)
        }))
        this.project.datasets = formated_res
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http post request to add a user to a project
  addUsertoProject(user_id) {
    return new Promise(resolve => {
      var post_object = { userId: user_id, scope: ["RIGHT_READ", "RIGHT_WRITE"], projectId: this.project.project["id"] }
      this.http.post(this.gateway_url + "/project/addusertoproject", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Functions for apiKey handling
  //Executed a http get request to get the api keys for a project
  getApiKeys() {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/apitoken", this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.apiKeys = res["token"]
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http get request to create a new api key for a project
  createApiKey(project_id) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/createapitoken?id=" + project_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.getApiKeys().then(() => {
          resolve("done")
        }, err => {
          console.log(err)
          this.openErrorDialog(err)
        }
        )
      })
    })
  }
  //Executes a http delete request to delete a api key of a project
  deleteApiKey(token_id) {
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/apitoken/" + token_id + "/delete", this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.getApiKeys().then(() => {
          resolve("")
        }, err => {
          console.log(err)
          this.openErrorDialog(err)
        }
        )

      })
    })
  }
  // Funtions for dataset handling
  //Executes a http post request to create a new dataset
  createDataset(new_dataset) {
    return new Promise(resolve => {
      var post_object = { name: new_dataset.name, description: new_dataset.description, projectId: this.project.project["id"], metadata: new_dataset.metadata, labels: new_dataset.labels }
      console.log(post_object)
      this.http.post(this.gateway_url + "/dataset/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http delete request to delete a dataset
  deleteDataset(dataset_id) {
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/dataset/" + dataset_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http post request to get the details of a dataset
  getDatasetDetails(dataset_id) {
    return new Promise(resolve => {
      var post_object = { id: dataset_id }
      this.http.post(this.gateway_url + "/dataset/get", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        //console.log(res)
        resolve(res["dataset"])
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  // Functions for Dataset Versions
  //Executes a http post request to get all versions of a dataset
  viewDatasetVersions(element) {
    return new Promise(resolve => {
      var post_object = { id: element.id }
      this.http.post(this.gateway_url + "/datasetversions/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.datasetVersions = res["datasetVersions"]
        this.dataset = element
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }
  //Functions for Dataset Versions Pagination
  /* viewDatasetVersionsPagination(element) {
     return new Promise(resolve => {
       console.log(this.paginantor_config_versions)
       var post_object = { id: element.id, pageRequest: { lastUuid: "", pageSize: this.paginantor_config_versions.pagesize.toString() } }
       if (this.paginantor_config_versions.activepage > 0) {
         post_object.pageRequest.lastUuid = this.paginantor_config_versions.lastIds[this.paginantor_config_versions.activepage - 1]
       }
       this.http.post(this.gateway_url + "/datasetversions/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
         console.log(res)
         this.datasetVersions = res["datasetVersions"] 
           resolve("")
         
         //this.obj_groups = res["objectGroups"]
         this.dataset = element
 
       })
     })
   }
 
   getDatasetVersionsPagination(element) {
     return new Promise(resolve => {
       var post_obj = { id: element.id }
       console.log(post_obj)
       this.http.post(this.gateway_url + "/datasetversions/list", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
         console.log(res)
 
         this.paginantor_config_versions.stats.groupscount = res["datasetVersions"].length
         this.paginantor_config_versions.stats.objectscount = 0
         this.paginantor_config_versions.pagecount = Math.ceil(this.paginantor_config_versions.stats.groupscount / this.paginantor_config_versions.pagesize)
         this.paginantor_config_versions.lastIds = []
         this.paginantor_config_versions.activepage = 0
         for (let [i, group] of res["datasetVersions"].entries()) {
           //this.paginantor_config_versions.stats.objectscount += group["objects"].length
           if (i % this.paginantor_config_versions.pagesize == this.paginantor_config_versions.pagesize - 1) {
             console.log("last element", i, group)
             this.paginantor_config_versions.lastIds.push(group.id)
           }
         }
         console.log(this.paginantor_config_versions)
         resolve("")
       })
     })
   }*/

  //Executes a http post request to get, format and return the object groups of a version
  getGroupsInVersion(element) {
    return new Promise(resolve => {
      var post_object = { id: element.id }
      console.log(post_object)
      this.http.post(this.gateway_url + "/datasetversion/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        var formated_res = res["objectGroup"].map(v => Object.assign(v, {
          isSelected: false,
          created: v["objects"][0].created,
          objectcount: v["objects"].length,
          filetypes: Array.from(new Set(v.objects.map(o => o.filetype))),
          //sumContentLen: String(v.objects.map(o => Number(o.contentLen)).reduce((a,b) => a + b,0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          objects: v.objects.map(o => Object.assign(o, {
            contentLen: o["contentLen"].replace(/\B(?=(\d{3})+(?!\d))/g, ".")
          }))
        }))
        resolve(formated_res);
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }
  //Executes a http post request to get and return the details of a version
  getDatasetVersion(id) {
    return new Promise(resolve => {
      var post_object = { id: id }
      console.log(post_object)
      this.http.post(this.gateway_url + "/datasetversion/get", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        resolve(res["datasetVersion"])
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http post request to get, format and return the object groups of a dataset
  getObjectGroupsForVersioning(dataset_id) {
    return new Promise(resolve => {
      var post_obj = { id: dataset_id }
      this.http.post(this.gateway_url + "/dataset/list", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        //remove: created: v["objects"][0].created when creation date issue is fixed
        var formated_res = res["objectGroups"].map(v => Object.assign(v, {
          isSelected: false,
          created: v["objects"][0].created,
          objectcount: v["objects"].length,
          filetypes: Array.from(new Set(v.objects.map(o => o.filetype))),
          //sumContentLen: String(v.objects.map(o => Number(o.contentLen)).reduce((a,b) => a + b,0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          objects: v.objects.map(o => Object.assign(o, {
            contentLen: o["contentLen"].replace(/\B(?=(\d{3})+(?!\d))/g, ".")
          }))
        }))
        /*for (let [i,object_group] of formated_res.entries()) {
           //console.log(object)
           formated_res[i].averageContentLen = object_group.objects.map(o => o.contentLen).reduce((a,b) => a + b,0)/object_group.objectcount
         }*/
        console.log(formated_res)
        resolve(formated_res)
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }




  //Executes a http post request to create a new version
  createDatasetVersion(post_object) {
    return new Promise(resolve => {
      /*var post_object = {
          name: input_data.name, datasetId: dataset_id, 
          version:{},
          description: input_data.description,
        }*/
      this.http.post(this.gateway_url + "/datasetversion/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  //Executes a http delete request to delete a version
  deleteVersion(version_id) {
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/datasetversion/" + version_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }

  // Functions for Object and Object Group handling
  //Executes a http request to get all object groups of a dataset with pagination and exectues formatObjGroup
  viewObjectGroups(element) {
    return new Promise(resolve => {
      console.log(this.paginantor_config)
      var post_object = { id: element.id, pageRequest: { lastUuid: "", pageSize: this.paginantor_config.pagesize.toString() } }
      if (this.paginantor_config.activepage > 0) {
        post_object.pageRequest.lastUuid = this.paginantor_config.lastIds[this.paginantor_config.activepage - 1]
      }
      this.http.post(this.gateway_url + "/dataset/list", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)
        this.formatObjGroup(res["objectGroups"]).then(_ => {
          resolve("")
        }, err => {
          console.log(err)
          this.openErrorDialog(err)
        }
        )
        //this.obj_groups = res["objectGroups"]
        this.dataset = element

      })
    })
  }
  //Executes a http post request to get, format and return the details of the object group
  getObjectGroup(id) {
    return new Promise(resolve => {
      var post_object = { id: id }
      console.log(post_object)
      this.http.post(this.gateway_url + "/objectgroup/get", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        var formated_res = Object.assign(res["objectGroup"], {
          created: res["objectGroup"]["objects"][0].created,
          objectcount: res["objectGroup"]["objects"].length,
          filetypes: Array.from(new Set(res["objectGroup"].objects.map(o => o.filetype))),
          //sumContentLen: String(res["objectGroup"].objects.map(o => Number(o.contentLen)).reduce((a,b) => a + b,0)).replace(/\B(?=(\d{3})+(?!\d))/g, "."),
          objects: res["objectGroup"].objects.map(o => Object.assign(o, {
            contentLen: o["contentLen"].replace(/\B(?=(\d{3})+(?!\d))/g, ".")
          }))
        })
        resolve(res["objectGroup"])
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }




  //Executes a http post request to get all object groups of a dataset to create the pagination config
  getObjectGroupPagination(element) {
    return new Promise(resolve => {
      var post_obj = { id: element.id }
      console.log(post_obj)
      this.http.post(this.gateway_url + "/dataset/list", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log(res)

        this.paginantor_config.stats.groupscount = res["objectGroups"].length
        this.paginantor_config.stats.objectscount = 0
        this.paginantor_config.pagecount = Math.ceil(this.paginantor_config.stats.groupscount / this.paginantor_config.pagesize)
        this.paginantor_config.lastIds = []
        this.paginantor_config.activepage = 0
        for (let [i, group] of res["objectGroups"].entries()) {
          this.paginantor_config.stats.objectscount += group["objects"].length
          if (i % this.paginantor_config.pagesize == this.paginantor_config.pagesize - 1) {
            console.log("last element", i, group)
            this.paginantor_config.lastIds.push(group.id)
          }
        }
        console.log(this.paginantor_config)
        resolve("")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
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

  //Formats the object group objects to get additional stats and functionality 
  formatObjGroup(data: any) {
    return new Promise(resolve => {
      var new_data = data.map(v => Object.assign(v, {
        isExpanded: false,
        objectcount: v["objects"].length,
        created: v["objects"][0].created,
        status: v.status.split("_")[1].toLowerCase().charAt(0).toUpperCase()
          + v.status.split("_")[1].toLowerCase().slice(1),
        objects: v.objects.map(o => Object.assign(o, { contentLen: o["contentLen"].replace(/\B(?=(\d{3})+(?!\d))/g, ".") }))
      }))
      console.log(new_data)
      this.obj_groups = new_data
      resolve("")
    })
  }

  //Executes a http post request to create a new object group and returns the upload link for each object in the group
  createObjectGroup(dataset_id, new_objgroup) {
    return new Promise(resolve => {
      var post_object = new_objgroup
      post_object["datasetId"] = dataset_id
      post_object["includeObjectLink"] = true
      post_object.generated = moment(post_object.generated).toISOString()
      console.log(post_object)
      this.http.post(this.gateway_url + "/objectgroup/create", post_object, this.configureHeadersAccessKey()).pipe().subscribe(res => {
        console.log("Create Object Response", res)
        resolve(res)
      })
    })
  }

  //Executes a http delete request to delete a object group
  deleteObjectGroup(objectgroup_id) {
    console.log(objectgroup_id)
    return new Promise(resolve => {
      this.http.delete(this.gateway_url + "/objectgroup/" + objectgroup_id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        resolve("done")
      }, err => {
        console.log(err)
        this.openErrorDialog(err)
      }
      )
    })
  }


  // Functions for uploading and downloading files
  //Executes a http put request to upload a single file < 4gb
  uploadFile(url, file) {
    console.log(url, file)
    var data = new FormData()
    data.append("file", file)
    var headers = this.configureHeadersAccessKey()
    headers["reportProgress"] = true
    headers["observe"] = "events"
    return this.http.put(url, file, headers).pipe()
  }

  //Executes a http get request to download a single object
  downloadSingleObject(object) {
    return new Promise(resolve => {
      this.http.get(this.gateway_url + "/objectload/download/" + object.id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.http.get(res_added["downloadLink"], { responseType: "blob" }).subscribe(res_dl => {
          FileSaver.saveAs(res_dl, object.filename + "." + object.filetype)
        })
        //window.open(res_added["downloadLink"])
        resolve("done")
        //404 Error => Object not found Snackbar
      })
    })
  }
  /*
    downloadObjectGroup(group_id) {
      return new Promise(resolve => {
        var post_obj = { streamType: "STREAM_TYPE_TARGZ", dataset: { datasetId: this.dataset.id } }
        //post_obj.groupIds.objectGroups.push(group_id)
        console.log(post_obj)
        ///launch dialog -> link copy
  
        this.http.post(this.gateway_url + "/objectgroupsstream", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
          console.log("Object Group Response", res)
          resolve(res)
          //FileSaver.saveAs(data, filename)
  
          window.open(res["url"])
  
        })
      })
    }*/

  //Executes http get requests to download all objects in the object group
  downloadObjectGroupNew(group) {
    console.log(group)
    for (let object of group.objects) {
      console.log(object)
      this.http.get(this.gateway_url + "/objectload/download/" + object.id, this.configureHeadersAccessKey()).pipe().subscribe(res_added => {
        console.log(res_added)
        this.http.get(res_added["downloadLink"], { responseType: "blob" }).subscribe(res_dl => {
          FileSaver.saveAs(res_dl, object.filename + "." + object.filetype)
        })
      })
    }
  }

  //Executes a http post request to init multipart upload on the server side
  initMultipartUpload(object_id) {
    return new Promise(resove => {
      var post_obj = { id: object_id }
      this.http.post(this.gateway_url + "/objectload/init_multipart/" + object_id, post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res_uploadLink => {
        console.log("initMultipart: ", res_uploadLink)
        resove("")
      })
    })
  }

  //Uploads one chunk
  uploadMultipartPart(chunk, chunkId, objectid, index) {
    // upload chunk
    return new Promise(resolve => {
      console.log("Init Upload Part: ", chunkId)
      // request to get the signed upload link for uploading the chunk
      this.http.get(this.gateway_url + "/objectload/upload_multipart_part/" + objectid + "/" + chunkId, this.configureHeadersAccessKey()).pipe().subscribe(res_url => {
        //console.log(res_url)
        var options = this.configureHeadersAccessKey()
        options["reportProgress"] = true
        options["observe"] = "events"
        console.log("Uploading", chunk, chunkId, options)
        // upload chunk to the signed link
        this.http.put(res_url["uploadLink"], chunk, options).pipe().subscribe((event: HttpEvent<any>) => {
          //handling the http response events
          switch (event.type) {
            case HttpEventType.UploadProgress:
              //control the upload progress for each chunk
              this.multipart_progress_ls[index][chunkId] = event.loaded
              this.getMultipartProgress(index)
              break;
            case HttpEventType.Response:
              //upload finished for chunk
              console.log("PUT Response:", chunkId, event)
              this.multipart_res_ls[index].push({ etag: event["headers"].get("etag"), part: chunkId })
              resolve("")
              break;
          }
        }, err => {
          console.log("Error:", err)
          this.uploadMultipartPart(chunk, chunkId, objectid, index)
        })
      }, err => {
        console.log("Error:", err)
        this.uploadMultipartPart(chunk, chunkId, objectid, index)
      })
    })
  }

  // calculating the progress of the multipart upload by adding up the progress of each chunk 
  getMultipartProgress(index) {
    var uploaded_progress = 0
    for (let chunk in this.multipart_progress_ls[index]) {
      uploaded_progress += this.multipart_progress_ls[index][chunk]
    }
    this.multipart_loaded[index].next({ progress: uploaded_progress, finished: false })
  }

  completeMultipartUpload(object_id, part_ls, index, filesize) {
    // request to complete the multipart upload
    // part_ls = [{etag: "", part: ""}]
    console.log(part_ls)
    var post_obj = { objectId: object_id, parts: part_ls }
    this.http.post(this.gateway_url + "/objectload/complete_multipart", post_obj, this.configureHeadersAccessKey()).pipe().subscribe(res => {
      console.log(res)
      //finished upload for file
      this.multipart_loaded[index].next({ progress: filesize, finished: true })
    })
  }

  fullMultipartUpload(object, index) {
    //starting the multipart upload on the client side
    this.chunksQuantity_ls[index] = Math.ceil(object.file.size / this.chunksize)

    for (let i = 1; i <= this.chunksQuantity_ls[index]; i++) { this.chunksQueue_ls[index].push(i) }
    this.chunksQueue_ls[index].reverse()
    this.sendNext(object, index)

  }

  sendNext(object, index) {
    //spliting the file into chunks, uploading these and handling the threads for the upload
    if (this.activeConnections_ls[index] >= this.threadsQuantity) {
      console.log("too many threads")
      return
    }

    if (!this.chunksQueue_ls[index].length) {
      console.log("All parts in upload")
      if (this.activeConnections_ls[index] == 0) {
        console.log("Multipart Upload FINISHED File:", object.file.name)
        //complete Multipart upload
        this.completeMultipartUpload(object.uploadParams.id, this.multipart_res_ls[index], index, object.file.size)
      }
      return
    }
    //split file into chunk
    const chunkId = this.chunksQueue_ls[index].pop()
    const begin = (chunkId - 1) * this.chunksize
    const chunk = object.file.slice(begin, begin + this.chunksize)
    this.activeConnections_ls[index] += 1
    //upload chunk
    this.uploadMultipartPart(chunk, chunkId, object.uploadParams.id, index).then(() => {
      this.activeConnections_ls[index] -= 1
      console.log("reduced thread")
      //send next chunk
      this.sendNext(object, index)
    })
    //send next chunk
    this.sendNext(object, index)
  }

}
