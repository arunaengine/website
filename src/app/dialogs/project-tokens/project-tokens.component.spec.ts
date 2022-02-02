import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProjectTokensComponent } from './project-tokens.component';

describe('ProjectTokensComponent', () => {
  let component: ProjectTokensComponent;
  let fixture: ComponentFixture<ProjectTokensComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ProjectTokensComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ProjectTokensComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
