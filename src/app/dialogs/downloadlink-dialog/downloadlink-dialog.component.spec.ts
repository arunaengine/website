import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DownloadlinkDialogComponent } from './downloadlink-dialog.component';

describe('DownloadlinkDialogComponent', () => {
  let component: DownloadlinkDialogComponent;
  let fixture: ComponentFixture<DownloadlinkDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DownloadlinkDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DownloadlinkDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
