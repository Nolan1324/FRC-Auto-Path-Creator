import {Component, ElementRef, isDevMode, OnInit, ViewChild} from '@angular/core';
import {CdkDragDrop, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {MatPaginator, MatRow, MatRowDef, MatSelectChange, MatTable, MatTableDataSource} from '@angular/material';
import * as csv from 'csvtojson';
import { saveAs } from './../../node_modules/file-saver/dist/FileSaver'
import {first} from 'rxjs/internal/operators/first';

//import {observeOn} from 'rxjs/operators';
//import set = Reflect.set;
//import * as jsonexport from './../../node_modules/jsonexport/dist/index.js'd

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  @ViewChild(MatTable) table: MatTable<Point>;
  @ViewChild('coveringCanvas') canvas: ElementRef;
  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(CdkDropList) dropList: CdkDropList;

  ctx: CanvasRenderingContext2D;

  //Lock mode
  placingPoints: boolean = false;
  lockMode: null | '45' | 'setpoints' = null;

  //Rotation
  rotateInterval = null;

  //Mouse
  lastMouseX = 0;
  lastMouseY = 0;

  //Scaling constants
  scale = 0.48;
  width: number;
  height: number;
  pixelsPerInch: number;
  offsetX: number;
  offsetY: number;

  //Field dimens (in)
  fieldWidth = 323.25;
  fieldHeight = 629.25;

  //Robot dimens (in)
  robotWidth = 24;
  robotLength = 30;

  //Starting positions
  origin = new PositionPoint(null, null, null);
  startingPositions: PositionPoint[] = [
    new PositionPoint(121.98, 227.24,'Goal')
  ];

  //Setpoints (locking)
  setpoints: Point[] = [
    new Point(0, 0, 0)
  ];

  //Stores the canvas values (rather than the meter values) of the setpoints
  setpointsCanvas: {x: number, y: number}[];

  //Options
  showRobotFrames = true;
  showPath = false;

  //Stores the current points in the auto program
  points: Point[] = [new Point(0, 0, 0)];
  focusedPointIndex: number = -1;
  dataSource = new MatTableDataSource<Point>(this.points);

  //Columns to display in the point table
  displayedColumns: string[] = ['x', 'y', 'radius', 'speed', 'delete'];

  fileName: string = "buzz_auto.csv";
  assetsPath = './assets/';

  constructor() {
    //Changes the asset path when in development mode
    if(isDevMode()) this.assetsPath = './../assets/';
    //Updates the scale
    this.scale = window.innerHeight * 0.00033;
    this.updateScale();
    //Adds the default starting position (none)
    this.startingPositions.unshift({name: null, x: 0, y: 0});
    //Creates setpoints reflected over the vertical center of the field
    this.setpoints = this.setpoints.concat(this.setpoints.map((point: Point) => {
      return this.invertPoint(Object.create(point) as Point);
    }));
  }

  //region ng inits
  ngOnInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngAfterViewInit() {
    this.ctx = (this.canvas.nativeElement as HTMLCanvasElement).getContext('2d');
  }
  //endregion

  //region Canvas key callbacks
  keydown(key: string) {
    if(this.placingPoints) {
      if (key === 'Control') {
        this.lockMode = '45';
      } else if (key === 'Shift') {
        this.mouseMove(this.lastMouseX, this.lastMouseY);
        this.drawSetpoints();
        this.lockMode = 'setpoints';
      } else if (key.toLowerCase() === 'a' || key === 'ArrowLeft') {
        this.startRotation(-5);
      } else if (key.toLowerCase() === 'd' || key === 'ArrowRight') {
        this.startRotation(5);
      }
    }
  }

  keyup() {
    this.lockMode = null;
    this.stopRotation();
    this.draw();
  }
  //endregion

  //region Canvas mouse callbacks
  mouseMove(x: number, y: number) {
    let point: any;

    this.clear();
    this.drawPoints(false);
    if(this.lockMode === 'setpoints') {
      let closest: {x, y} = {x: 0, y: 0};
      let closestDist = 999999999999999;
      let closestIndex = -1;
      this.drawSetpoints();
      for(let i = 0; i < this.setpointsCanvas.length; i++) {
        const setpointCanvas = this.setpointsCanvas[i];
        const dist = Math.pow(setpointCanvas.x - x, 2) + Math.pow(setpointCanvas.y - y, 2);
        if(dist < closestDist) {
          closest = setpointCanvas;
          closestDist = dist;
          closestIndex = i;
        }
      }
      this.points[this.points.length - 1].radius = this.setpoints[closestIndex].radius;
      //this.points[this.points.length - 1].speed = this.setpoints[closestIndex].speed;
      this.drawDot(closest.x, closest.y, this.setpoints[closestIndex].radius, -2);
      point = this.canvasToInches(closest.x, closest.y);
    } else {
      console.log(x + " " + y);
      this.drawDot(x, y, this.points[this.points.length - 1].radius, -2);
      point = this.canvasToInches(x, y);
    }

    this.points[this.points.length - 1].x = AppComponent.round(point.x);
    this.points[this.points.length - 1].y = AppComponent.round(point.y);

    //this.drawCurve();

    this.lastMouseX = x;
    this.lastMouseY = y;
  }

  mouseEnter() {
    const lastIndex = this.points.length - 1;
    //const lastPoint = this.points[lastIndex];
    this.addRow(lastIndex);
    this.placingPoints = true;
  }

  mouseLeave() {
    this.lockMode = null;
    this.stopRotation();
    this.deleteRow(this.points.length - 1);
    this.draw();
    this.placingPoints = false;
  }

  mouseUp() {
    this.addRow(this.points.length - 1);
  }
  //endregion

  //region Rotation mode
  startRotation(amount: number) {
    if(this.rotateInterval === null) {
      this.rotateInterval = setInterval(() => {
        const lastPoint = this.points[this.points.length - 1];
        if((lastPoint.radius >= -amount && amount < 0) || (amount > 0)) {
          lastPoint.radius += amount;
          this.mouseMove(this.lastMouseX, this.lastMouseY);
        }
      }, 100);
    }
  }

  stopRotation() {
    if(this.rotateInterval !== null) {
      clearInterval(this.rotateInterval);
      this.rotateInterval = null;
    }
  }
  //endregion

  //region Canvas rendering
  draw() {
    this.clear();
    this.drawPoints(true);
    //this.drawCurve();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  headingToTrig(heading: number) {
    return (((360 - heading) + 90) / 180) * Math.PI;
  }

  drawPoints(includeLast: boolean) {
    for(let i = 0; i < this.points.length + (includeLast ? 0 : -1); i++) {
      const point = this.points[i];
      const canvasPoint = this.inchesToCanvas(point.x, point.y);
      this.drawDot(canvasPoint.x, canvasPoint.y, point.radius, i);
    }
  }

  drawSetpoints() {
    this.ctx.strokeStyle = '#d6d6d6';
    this.setpointsCanvas = this.setpoints.map((setpoint) => {
      const setpointCanvas = this.inchesToCanvas(setpoint.x - this.origin.x, setpoint.y - this.origin.y);
      this.ctx.beginPath();
      this.ctx.arc(setpointCanvas.x, setpointCanvas.y, 10.4 * this.scale, 0, 2 * Math.PI);
      this.ctx.stroke();
      return setpointCanvas;
      //this.drawRobot(setpoint.x, setpoint.y, setpoint.heading);
    });
  }

  drawDot(x, y, heading, i) {
    this.ctx.fillStyle = i === this.focusedPointIndex ? '#ff773e' : '#f8ff3e';
    this.ctx.strokeStyle = '#000000';
    heading = 360 - heading;
    this.ctx.beginPath();
    this.ctx.arc(x, y, 15 * this.scale, 0, 2 * Math.PI);
    this.ctx.fill();

    /*
    if(this.showRobotFrames) {
      this.drawRobot(x, y, heading);
    }
    */
  }

  drawRobot(x, y, heading) {
    const widthPixels = (this.robotWidth * this.pixelsPerInch) / 2;
    const lengthPixels = (this.robotLength * this.pixelsPerInch) / 2;
    this.ctx.beginPath();
    this.rotateAndPath(x, y, x - widthPixels, y - lengthPixels, heading, true);
    this.rotateAndPath(x, y, x + widthPixels, y - lengthPixels, heading, false);
    this.rotateAndPath(x, y, x + widthPixels, y + lengthPixels, heading, false);
    this.rotateAndPath(x, y, x - widthPixels, y + lengthPixels, heading, false);
    this.rotateAndPath(x, y, x - widthPixels, y - lengthPixels, heading, false);
    this.ctx.stroke();
  }

  rotateAndPath(cx, cy, x, y, angle, first) {
    const point = this.rotate(cx, cy, x, y, angle);
    if(first) {
      this.ctx.moveTo(point.x, point.y);
    } else {
      this.ctx.lineTo(point.x, point.y);
    }
  }

  updateScale() {
    this.width = 1299 * this.scale;
    this.height = 2598 * this.scale;
    this.pixelsPerInch = (1299 / this.fieldWidth) * this.scale;
    this.offsetX = 0 * this.scale;
    this.offsetY = 30 * this.scale;
  }
  //endregion

  //region Coordinate manipulation
  rotate(cx, cy, x, y, angle) {
    const radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
    ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return {x: nx, y: ny};
  }

  invertPoint(point: Point) {
    point.x = this.fieldWidth - point.x;
    return point;
  }

  canvasToInches(x: number, y: number) : {x: number, y: number} {
    let output: {x: number, y: number} = {x: null, y: null};
    output.x = (((this.height - y) - this.offsetY) / this.pixelsPerInch) - this.origin.x;
    output.y = -((x - this.offsetX) / this.pixelsPerInch) + this.fieldWidth - this.origin.y;
    return output;
  }

  inchesToCanvas(x: number, y: number) : {x: number, y: number} {
    let output: {x: number, y: number} = {x: null, y: null};
    output.x = (-(y - this.fieldWidth + this.origin.y) * this.pixelsPerInch) + this.offsetX;
    output.y = this.height - (((x + this.origin.x) * this.pixelsPerInch) + this.offsetY);
    return output;
  }
  //endregion

  //region Table and point list functions
  dropTable(event: CdkDragDrop<Point[]>) {
    //console.log(event.previousIndex + ' ' + event.currentIndex);
    //console.log(this.dropList.getItemIndex(event.));
    moveItemInArray(this.points, parseInt(event.item.element.nativeElement.getAttribute('index')), event.currentIndex);
    this.dataSource.data = this.points;
    this.table.renderRows();
    this.draw();
    //;
  }

  addRow(i: number) {
    this.points.splice(i + 1, 0, new Point(null, null, null));
    this.dataSource.data = this.points;
    this.table.renderRows();
    if((i + 1) % this.paginator.pageSize === 0) {
      /*
      setTimeout(() => {
        this.paginator.nextPage();
        this.focusRow(i);
      }, 1);
      */
      const interval = setInterval(() => {
        if(this.paginator.hasNextPage()) {
          this.paginator.nextPage();
          this.focusRow(i);
          clearInterval(interval);
        }
      }, 10);
    } else {
      this.focusRow(i);
    }
  }

  deleteRow(i: number) {
    if(this.points.length > 1) {
      this.points.splice(i, 1);
      this.dataSource.data = this.points;
      this.table.renderRows();
    } else {
      this.points[0] = new Point(0, 0, 0);
      this.dataSource.data = this.points;
      this.table.renderRows();
    }
    this.draw();
  }

  handleRowInput(key: string, i: number) {
    if(key === "Enter") {
      this.addRow(i);
    }
  }

  handleRowSelect(i: number) {
    this.focusedPointIndex = i;
    this.draw();
  }

  handleRowLeave() {
    this.focusedPointIndex = -1;
    this.draw();
  }

  focusRow(i: number) {
    this.table._getRenderedRows(this.table._rowOutlet)[(i % this.paginator.pageSize) + 1].firstElementChild.getElementsByTagName('input')[0].focus();
  }
  //endregion

  //region UI callbacks
  onFileSelected() {
    const inputNode: any = document.querySelector('#file');

    if (typeof (FileReader) !== 'undefined') {
      const reader = new FileReader();

      reader.onload = (e: any) => {
        csv({checkType: true}).fromString(AppComponent.ab2str(e.target.result)).then((data: Point[])=>{
          this.points = data;
          this.table.dataSource = data;
          const path = inputNode.value;
          this.fileName = path.substr(path.lastIndexOf('\\') + 1, path.length);
          inputNode.value = "";
          this.drawPoints(true);
        })
      };
      reader.readAsArrayBuffer(inputNode.files[0]);
    }
  }

  onSaveClick() {
    const blob = new Blob([AppComponent.arrayToCSV(this.points)], { type: 'text/plain' });
    saveAs(blob, this.fileName);
  }

  flipPath() {
    const newOriginX = AppComponent.round(this.fieldWidth - this.origin.x);
    this.points.map((point: Point) => {
      point.x += this.origin.x;
      point = this.invertPoint(point);
      point.x = AppComponent.round(point.x - newOriginX);
      return point;
    });
    this.origin.x = newOriginX;
    this.draw();
  }

  startPositionChange(x: number, y: number) {
    /*
    this.points.map((point: Point) => {
      if(point.x !== 0 && point.y !== 0) {
        point.x -= x;
        point.y -= y;
      }
    });
    */
    this.origin.x = x;
    this.origin.y = y;
    this.draw()
  }
  //endregion

  //region Data util
  private static round(x: number): number {
    return Math.round(x * 100) / 100;
  }

  private static arrayToCSV(objects: object[]) {
    if(objects.length > 0) {
      const header = Object.keys(objects[0]).join(',');
      const body = objects.map((object) => {
        return Object.values(object).join(',');
      }).join('\r\n');
      return header + '\r\n' + body;
    } else {
      return '';
    }
  }

  private static ab2str(buf: any) {
    return String.fromCharCode.apply(null, new Uint8Array(buf));
  }
  //endregion
}

class Point {
  public x: number;
  public y: number;
  public radius: number;
  public speed: number;
  constructor(x: number, y: number, radius: number) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }
}

class PositionPoint {
  public x: number;
  public y: number;
  public name: string;

  constructor(x: number, y: number, name: string) {
    this.x = x;
    this.y = y;
    this.name = name;
  }
}
