class Arc {
  constructor(lineA, lineB) {
    this.lineA = lineA;
    this.lineB = lineB;
    this.center = Line.intersect(lineA.end, lineA.end.translate(lineA.slope.perp()), lineB.start, lineB.start.translate(lineB.slope.perp()));
    this.center.draw;
    this.radius = Translation2d.diff(lineA.end, this.center).norm();
  }

  draw() {
    var sTrans = Translation2d.diff(this.center, this.lineA.end);
    var eTrans = Translation2d.diff(this.center, this.lineB.start);
    console.log(sTrans);
    console.log(eTrans);
    var sAngle, eAngle;
    if(Translation2d.cross(sTrans, eTrans) > 0) {
      eAngle = -Math.atan2(sTrans.y, sTrans.x);
      sAngle = -Math.atan2(eTrans.y, eTrans.x);
    } else {
      sAngle = -Math.atan2(sTrans.y, sTrans.x);
      eAngle = -Math.atan2(eTrans.y, eTrans.x);
    }
    this.lineA.draw();
    this.lineB.draw();
    ctx.beginPath();
    ctx.arc(this.center.drawX,this.center.drawY,this.radius*(width/fieldWidth),sAngle,eAngle);
    ctx.strokeStyle=getColorForSpeed(this.lineB.pointB.speed);
    ctx.stroke();
  }

  fill() {
    this.lineA.fill();
    this.lineB.fill();
    var sTrans = Translation2d.diff(this.center, this.lineA.end);
    var eTrans = Translation2d.diff(this.center, this.lineB.start);
    var sAngle = (Translation2d.cross(sTrans, eTrans) > 0) ? sTrans.angle : eTrans.angle;
    var angle = Translation2d.angle(sTrans, eTrans);
    var length = angle * this.radius;
    for(var i=0; i<length; i+=this.radius/100) {
      drawRotatedRect(this.center.translate(new Translation2d(this.radius*Math.cos(sAngle-i/length*angle),-this.radius*Math.sin(sAngle-i/length*angle))), robotHeight, robotWidth, sAngle-i/length*angle+Math.PI/2, null, pathFillColor, true);
    }



  }

  static fromPoints(a, b, c) {
    return new Arc( new Line(a, b), new Line(b, c));
  }
}
