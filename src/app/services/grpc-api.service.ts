import { Injectable } from '@angular/core';
//import { ProjectServiceClient } from '../generated/api/services/v1/project_service_grpc_web_pb';

@Injectable({
  providedIn: 'root'
})
export class GrpcApiService {
  //private projectServiceClient: ProjectServiceClient 
  constructor() { }

  createProject(){
    /*const request = new CreateProjectRequest()
    request.setName("test")
    request.setDescription("random description")
    this.projectServiceClient.createProject(request, null)
  }*/
}
}
