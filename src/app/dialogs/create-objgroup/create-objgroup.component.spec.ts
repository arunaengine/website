import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateObjgroupComponent } from './create-objgroup.component';

describe('CreateObjgroupComponent', () => {
  let component: CreateObjgroupComponent;
  let fixture: ComponentFixture<CreateObjgroupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ CreateObjgroupComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateObjgroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
