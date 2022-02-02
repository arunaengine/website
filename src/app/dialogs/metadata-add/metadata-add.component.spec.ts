import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MetadataAddComponent } from './metadata-add.component';

describe('MetadataAddComponent', () => {
  let component: MetadataAddComponent;
  let fixture: ComponentFixture<MetadataAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MetadataAddComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MetadataAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
