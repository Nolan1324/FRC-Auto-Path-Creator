class Point {
  x: number;
  y: number;
  heading: number;
  minSpeed: number;
  maxSpeed: number;
  turnRate: number;

  constructor(x: number, y: number, heading: number, minSpeed: number, maxSpeed: number, turnRate: number) {
    this.x = x;
    this.y = y;
    this.heading = heading;
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
    this.turnRate = turnRate;
  }

  static newInstance() {
    return new Point(null, null, null, null, null, null);
  }
}
