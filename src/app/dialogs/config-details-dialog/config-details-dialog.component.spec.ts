import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigDetailsDialogComponent } from './config-details-dialog.component';

describe('ConfigDetailsDialogComponent', () => {
  let component: ConfigDetailsDialogComponent;
  let fixture: ComponentFixture<ConfigDetailsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ConfigDetailsDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ConfigDetailsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
