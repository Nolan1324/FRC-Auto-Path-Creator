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
  pixelsPerMeter: number;
  offsetX: number;
  offsetY: number;

  //Field dimens (m)
  fieldWidth = 27;
  fieldHeight = 54;

  //Robot dimens (m)
  robotWidth = 3;
  robotLength = 3;

  //Starting positions
  origin = new PositionPoint(null, null, null);
  startingPositions: PositionPoint[] = [
    new PositionPoint(10.73, 5.61,'Level 1 Left'),
    new PositionPoint(this.fieldWidth / 2, 5.61,'Level 1 Center'),
    new PositionPoint(this.fieldWidth - 10.73, 5.61,'Level 1 Right'),
    new PositionPoint(9.88, 2.03,'Level 2 Left'),
    new PositionPoint(this.fieldWidth - 9.88, 2.03,'Level 2 Right'),
  ];

  //Setpoints (locking)
  setpoints: Point[] = [
    new Point(9.84, 21.62, 90), //Ship close
    new Point(9.84, 21.62 + 1.67, 90), //Ship middle
    new Point(9.84, 21.62 + 2 * 1.67, 90), //Ship far
    new Point(4.27, 18.96, -90), //Rocket cargo
    new Point(2.66, 15.94, -31), //Rocket close
    new Point(2.66, 21.98, -180 + 31), //Rocket far
    new Point(12.66, 16.83, 0), //Ship center hatch
    new Point(2.23, 1.74, 0) //Human player station
  ];

  //Stores the canvas values (rather than the meter values) of the setpoints
  setpointsCanvas: {x: number, y: number}[];

  //Options
  showRobotFrames = true;
  showPath = false;
  curveScalar = 0.3;

  //Stores the current points in the auto program
  points: Point[] = [new Point(0, 0, 0)];
  focusedPointIndex: number = -1;
  dataSource = new MatTableDataSource<Point>(this.points);

  //Columns to display in the point table
  displayedColumns: string[] = ['x', 'y', 'heading', 'maxSpeed', 'minSpeed', 'turnRate', 'delete'];

  fileName: string = "buzz_auto.csv";
  assetsPath = './assets/';

  constructor() {
    //Changes the asset path when in development mode
    if(isDevMode()) this.assetsPath = './../assets/';
    //Updates the scale
    this.scale = window.innerHeight * 5.985e-4;
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
      this.points[this.points.length - 1].heading = this.setpoints[closestIndex].heading;
      //this.points[this.points.length - 1].speed = this.setpoints[closestIndex].speed;
      this.drawDot(closest.x, closest.y, this.setpoints[closestIndex].heading, -2);
      point = this.canvasToMeters(closest.x, closest.y);
    } else {
      this.drawDot(x, y, this.points[this.points.length - 1].heading, -2);
      point = this.canvasToMeters(x, y);
    }

    this.points[this.points.length - 1].x = AppComponent.round(point.x);
    this.points[this.points.length - 1].y = AppComponent.round(point.y);

    this.drawCurve();

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
        if((lastPoint.heading >= -180 - amount && amount < 0) || (lastPoint.heading <= 180 - amount && amount > 0)) {
          lastPoint.heading += amount;
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
    this.drawCurve();
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  drawCurve() {
    if(this.showPath) {
      this.ctx.strokeStyle = '#f8ff3e';
      for (let i = 0; i < this.points.length - 1; i++) {
        const start = this.points[i];
        const end = this.points[i + 1];
        const dist = Math.hypot(end.x - start.x, end.y - start.y);

        const ax1 = Math.cos(this.headingToTrig(start.heading)) * dist * this.curveScalar;
        const ay1 = Math.sin(this.headingToTrig(start.heading)) * dist * this.curveScalar;
        const ax2 = Math.cos(this.headingToTrig(end.heading)) * dist * this.curveScalar;
        const ay2 = Math.sin(this.headingToTrig(end.heading)) * dist * this.curveScalar;

        this.ctx.beginPath();
        this.ctx.moveTo(this.xToCanvas(start.x), this.yToCanvas(start.y));
        this.ctx.bezierCurveTo(
          this.xToCanvas(start.x + ax1),
          this.yToCanvas(start.y + ay1),
          this.xToCanvas(end.x - ax1),
          this.yToCanvas(end.y - ay2),
          this.xToCanvas(end.x),
          this.yToCanvas(end.y));
        this.ctx.stroke();
      }
    }
  }
  
  headingToTrig(heading: number) {
    return (((360 - heading) + 90) / 180) * Math.PI;
  }

  drawPoints(includeLast: boolean) {
    for(let i = 0; i < this.points.length + (includeLast ? 0 : -1); i++) {
      const point = this.points[i];
      const canvasPoint = this.metersToCanvas(point.x, point.y);
      this.drawDot(canvasPoint.x, canvasPoint.y, point.heading, i);
    }
  }

  drawSetpoints() {
    this.ctx.strokeStyle = '#d6d6d6';
    this.setpointsCanvas = this.setpoints.map((setpoint) => {
      const setpointCanvas = this.metersToCanvas(setpoint.x - this.origin.x, setpoint.y - this.origin.y);
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
    this.ctx.arc(x, y, 10.4 * this.scale, 0, 2 * Math.PI);
    this.ctx.fill();
    if(this.showRobotFrames) {
      this.drawRobot(x, y, heading);
    }
  }

  drawRobot(x, y, heading) {
    const widthPixels = (this.robotWidth * this.pixelsPerMeter) / 2;
    const lengthPixels = (this.robotLength * this.pixelsPerMeter) / 2;
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
    this.width = 616 * this.scale;
    this.height = 1500 * this.scale;
    this.pixelsPerMeter = (20.44 /* 3.281*/) * this.scale;
    this.offsetX = 29.167 * this.scale; /* 14 */ /* 19 */
    this.offsetY = 200 * this.scale; /* 96 */ /* 101 */
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
    point.heading *= -1;
    return point;
  }

  canvasToMeters(x: number, y: number) : {x: number, y: number} {
    let output: {x: number, y: number} = {x: null, y: null};
    output.x = ((x - this.offsetX) / this.pixelsPerMeter) - this.origin.x;
    output.y = (((this.height - y) - this.offsetY) / this.pixelsPerMeter) - this.origin.y;
    return output;
  }

  metersToCanvas(x: number, y: number) : {x: number, y: number} {
    let output: {x: number, y: number} = {x: null, y: null};
    output.x = this.xToCanvas(x);
    output.y = this.yToCanvas(y);
    return output;
  }

  xToCanvas(x: number) {
    return ((x + this.origin.x) * this.pixelsPerMeter) + this.offsetX;
  }

  yToCanvas(y: number) {
    return this.height - (((y + this.origin.y) * this.pixelsPerMeter) + this.offsetY);
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
  public heading: number;
  public minSpeed: number;
  public maxSpeed: number;
  public turnRate: number;

  constructor(x: number, y: number, heading: number/*, minSpeed: number, maxSpeed: number, turnRate: number*/) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    //this.minSpeed = minSpeed;
    //this.maxSpeed = maxSpeed;
    //this.turnRate = turnRate;
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

