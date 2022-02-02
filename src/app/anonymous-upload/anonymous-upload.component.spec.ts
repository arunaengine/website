import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnonymousUploadComponent } from './anonymous-upload.component';

describe('AnonymousUploadComponent', () => {
  let component: AnonymousUploadComponent;
  let fixture: ComponentFixture<AnonymousUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AnonymousUploadComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AnonymousUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
