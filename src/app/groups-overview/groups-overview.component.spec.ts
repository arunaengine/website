import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GroupsOverviewComponent } from './groups-overview.component';

describe('GroupsOverviewComponent', () => {
  let component: GroupsOverviewComponent;
  let fixture: ComponentFixture<GroupsOverviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GroupsOverviewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GroupsOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
