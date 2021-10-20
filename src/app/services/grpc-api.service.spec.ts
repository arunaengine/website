import { TestBed } from '@angular/core/testing';

import { GrpcApiService } from './grpc-api.service';

describe('GrpcApiService', () => {
  let service: GrpcApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GrpcApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
