import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { ChipDetailsComponent } from '../chip-details/chip-details.component';

@Component({
  selector: 'app-create-version',
  templateUrl: './create-version.component.html',
  styleUrls: ['./create-version.component.scss']
})
export class CreateVersionComponent implements OnInit {

  new_version= {
                      name: "", datasetId: "", description: "",
                      version: {major: 0, minor: 0, patch: 0, revision: 0, stage: "STABLE"},
                      labels: [],
                      metadata: [],
                      objectGroupIds: [],
                    }
  label = { key: "", value: "" };
  semVersion = "0.0.0.0";
  label_table:any
  notValid = true
  labelColumns: string[]
  selectedTableColums: string[]
  objectGroups_data: any
  displayed_objectGroups: any
  selectedGroups_table: any
  selectedGroups_arr = []
  disabled = true
  maxDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()+1)

  //keywordFilter = ""
  filterObject = {keywords: "", name: "", objectcount: {min: 0, max:0}, onlySelected: false, onlyUnselected: false, date_range: { start: null, end: null }}


  disableAnimation = true;
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    console.log(this.data);
    this.labelColumns=["key", "value", "delete"]
    this.selectedTableColums= ["name", "description","created", "delete"]
    this.new_version.datasetId = this.data.dataset.id
    this.label_table = new MatTableDataSource(this.new_version.labels)
    this.selectedGroups_table = new MatTableDataSource(this.selectedGroups_arr)
    this.displayed_objectGroups = this.data.objectGroups
    console.log(this.objectGroups_data)
    console.log(this.maxDate)
   }

  ngOnInit(): void {
  }
  ngAfterViewInit(): void {
    //WORKAROUND EXPANDED FLICKER
    // timeout required to avoid the dreaded 'ExpressionChangedAfterItHasBeenCheckedError'
    setTimeout(() => this.disableAnimation = false);
  }

  addtoLabels() {
    var add = true
    for (let label_inObj of this.new_version.labels) {
      if (label_inObj.key == this.label.key) {
        add = false
      }
    }
    if (this.label.key != "" && this.label.value != "") {
      if (add) {
        this.new_version.labels.push(this.label)
        this.label = {
          key: "",
          value: ""
        }
        this.label_table = new MatTableDataSource(this.new_version.labels)
      } else {
        this.snackBar.open("Key already in use.", "", {
          duration: 3000,
          panelClass: ["warning-snackbar"]
        })
      }
    } else {
      this.snackBar.open("Key or Value can't be empty.", "", {
        duration: 3000,
        panelClass: ["warning-snackbar"]
      })
    }
  }

  deleteLabel(element) {
    const index: number = this.new_version.labels.indexOf(element)
    //console.log(index)
    this.new_version.labels.splice(index, 1)
    this.label_table = new MatTableDataSource(this.new_version.labels)
  }


  isValid(){
    if (this.new_version.name != "" && 
        this.new_version.description!= ""&&
        this.new_version.objectGroupIds.length != 0){
          this.notValid = false
        } else {
          this.notValid = true
        }
  }

  /*textFilter(event: Event) {
    //Function for filtering the project table
    const filterValue = (event.target as HTMLInputElement).value;
    this.objectGroups_data.filter = filterValue.trim().toLowerCase();
  }*/

  textFilter(event: Event, scope) {
    const filterValue = (event.target as HTMLInputElement).value.toLowerCase()
    console.log(filterValue, scope)

    this.displayed_objectGroups = this.data.objectGroups.filter(e => e[scope].includes(filterValue))
    console.log(this.displayed_objectGroups)
  }
  clickedChip(group){
    console.log(group)
    const dialogRef = this.dialog.open(ChipDetailsComponent, {
      hasBackdrop: true,
      data: {
        group: group
      }
    })
    dialogRef.afterClosed().subscribe(result => {
      if (result){
        console.log("Dialog closed: ", result)
        if (result == "select"){
          this.data.objectGroups[this.data.objectGroups.indexOf(group)].isSelected = true
        if (!this.selectedGroups_arr.includes(group)){
          this.selectedGroups_arr.push(group)
          this.selectedGroups_table = new MatTableDataSource(this.selectedGroups_arr)
          this.validVersion()
          console.log(this.data)
        }
        }
        if (result =="unselect"){
          this.removeChip(group)
        }
        
        
      } else {
        console.log("Dialog dismissed")
      }
    })
  }
  removeChip(group){
    this.data.objectGroups[this.data.objectGroups.indexOf(group)].isSelected = false
    if (this.selectedGroups_arr.includes(group)){
      this.selectedGroups_arr.splice(this.selectedGroups_arr.indexOf(group), 1)
      this.selectedGroups_table = new MatTableDataSource(this.selectedGroups_arr)
    }
    this.validVersion()
    console.log(this.data)
  }
  applyFilter() {
    console.log("applyFilter", this.filterObject)
    var data_to_filter = this.data.objectGroups
    if (this.filterObject.onlySelected){
      data_to_filter = data_to_filter.filter(e => e.isSelected == this.filterObject.onlySelected)
    } 
    if (this.filterObject.onlyUnselected){
      data_to_filter = data_to_filter.filter(e => e.isSelected != this.filterObject.onlyUnselected)
    }
    console.log(data_to_filter,this.data)
    if (this.filterObject.objectcount.max > 0){
      data_to_filter = data_to_filter.filter(e => e.objectcount >= this.filterObject.objectcount.min && e.objectcount <= this.filterObject.objectcount.max)
    }
    console.log(data_to_filter,this.data)

    if( this.filterObject.date_range.start != null){
      data_to_filter = data_to_filter.filter(e => e.created >= this.filterObject.date_range.start.toISOString())
    }
    if (this.filterObject.date_range.end != null){
      data_to_filter = data_to_filter.filter(e => e.created <= this.filterObject.date_range.end.toISOString())
    }
    if (this.filterObject.name != ""){
      data_to_filter = data_to_filter.filter(e => e.name.toLowerCase().includes(this.filterObject.name.toLowerCase()))
    }
    console.log(data_to_filter,this.data, this.filterObject.keywords.split(",") )
    if (this.filterObject.keywords != ""){
      data_to_filter = data_to_filter.filter(e => this.filterObject.keywords.split(",").some(keyword => e.description.toLowerCase().includes(keyword.toLowerCase().trim())))
    }
    console.log(data_to_filter,this.data)
    this.displayed_objectGroups = data_to_filter
  }
  filterUnseleced(){
    console.log("filterUnselected")
    if (this.filterObject.onlySelected){
      this.displayed_objectGroups = this.data.objectGroups.filter(e => e.isSelected == this.filterObject.onlySelected)
    } else {
      this.displayed_objectGroups = this.data.objectGroups
    }
  }
  filterSeleced(){
    console.log("filterSelected")
    if (this.filterObject.onlyUnselected){
      this.displayed_objectGroups = this.data.objectGroups.filter(e => e.isSelected != this.filterObject.onlyUnselected)
    } else {
      this.displayed_objectGroups = this.data.objectGroups
    }
  }
  resetFilter(){
    this.filterObject = {keywords: "", name: "", objectcount: {min: 0, max:0}, onlySelected: false, onlyUnselected: false, date_range: { start: null, end: null }}
    this.displayed_objectGroups = this.data.objectGroups
  }

  selectAll(){
    for (let group of this.displayed_objectGroups){
      this.data.objectGroups[this.data.objectGroups.indexOf(group)].isSelected = true
      if (!this.selectedGroups_arr.includes(group)){
        this.selectedGroups_arr.push(group)
      }
    }
    this.selectedGroups_table = new MatTableDataSource(this.selectedGroups_arr)
    this.validVersion()
  }
  unselectAll(){
    for (let group of this.displayed_objectGroups){
      this.data.objectGroups[this.data.objectGroups.indexOf(group)].isSelected = false
      if (this.selectedGroups_arr.includes(group)){
        this.selectedGroups_arr.splice(this.selectedGroups_arr.indexOf(group), 1)
      }
    }
    this.selectedGroups_table = new MatTableDataSource(this.selectedGroups_arr)
    this.validVersion()
  }

  validVersion(){
    console.log(this.new_version.version.major+"."+this.new_version.version.minor+"."+this.new_version.version.patch)
    if(this.new_version.name != "" &&
     this.new_version.description != "" &&
     this.selectedGroups_arr.length != 0 &&
     this.new_version.version.major+"."+this.new_version.version.minor+"."+this.new_version.version.patch != "0.0.0"){
      this.notValid= false
    } else {
      this.notValid= true
    }
  }

}
