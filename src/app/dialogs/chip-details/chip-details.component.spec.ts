import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChipDetailsComponent } from './chip-details.component';

describe('ChipDetailsComponent', () => {
  let component: ChipDetailsComponent;
  let fixture: ComponentFixture<ChipDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ChipDetailsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ChipDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
