function rgbToHex(r, g, b) {
  if (r > 255 || g > 255 || b > 255) throw "Invalid color component";
  return ((r << 16) | (g << 8) | b).toString(16);
}

const legend = {
  unknown: "?",
  unexplored: ".",
  explored: " ",
  flagged: "X",
};

class CanvasObject {
  #canvas = {};
  #context = null;

  constructor(canvas) {
    this.#canvas = {
      element: canvas,
      width: 600,
      height: 500,
    };
    this.#context = this.#canvas.element.getContext("2d");
  }

  getPixel(x, y) {
    const p = this.#context.getImageData(x, y, 1, 1).data;
    const hex = "#" + ("000000" + rgbToHex(p[0], p[1], p[2])).slice(-6);
    return hex;
  }

  getCanvas() {
    return this.#canvas.element;
  }
}

const offset = {
  dx: 13,
  dy: 8,
};

class Cell extends CanvasObject {
  row = -1;
  col = -1;
  size = -1;
  #tile = legend.unknown;

  constructor(canvas, col, row, size) {
    super(canvas);
    this.row = row;
    this.col = col;
    this.size = size;
  }

  key() {
    return `${this.col},${this.row}`;
  }

  colour() {
    return this.getPixel(
      this.col * this.size + offset.dx,
      this.row * this.size + offset.dy
    );
  }

  tile(force) {
    if (!force && ![legend.unknown, legend.unexplored].includes(this.#tile))
      return this.#tile;

    const colour = this.colour();

    const mappings = [
      { tile: legend.unexplored, colours: ["#aad751", "#a2d149"] },
      { tile: legend.explored, colours: ["#d7b899", "#e5c29f"] },
      { tile: legend.flagged, colours: ["#f23607"] },
      { tile: "1", colours: ["#297bce", "#287bcd"] }, // ["#287bcd", "#4a9347"] },
      { tile: "2", colours: ["#388e3c"] }, //["#499246", "#297bce"] },
      { tile: "3", colours: ["#d33130", "#d33030"] }, // ["#d4554c", "#d8574e"] },
      { tile: "4", colours: ["#8229a2", "#8128a1"] }, // ["#7d22a1"] },
      { tile: "5", colours: ["#ff8f00"] },
      { tile: "6", colours: ["#85ab9e", "#8eb1a1"] },
      { tile: "7", colours: [] },
      { tile: "8", colours: [] },
    ];

    for (const { tile, colours } of mappings) {
      if (colours.includes(colour)) {
        this.#tile = tile;
        return tile;
      }
    }

    return legend.unknown;
  }

  flag() {
    // Ignore already flagged
    if (this.tile() === legend.flagged) return;
    this.click(2);
  }

  reveal() {
    // Ignore already revealed
    if (this.tile() === legend.explored) return;
    this.click(0);
  }

  click(button) {
    const canvas = this.getCanvas();
    const viewportOffset = canvas.getBoundingClientRect();
    const { top, left } = viewportOffset;
    const x = left + this.col * this.size + offset.dx;
    const y = top + this.row * this.size + offset.dy;
    const events = ["mousedown", "mouseup"].map(
      (type) =>
        new MouseEvent(type, {
          clientX: x,
          clientY: y,
          button,
        })
    );
    const el = document.elementFromPoint(x, y);
    events.forEach((event) => el.dispatchEvent(event));
  }
}

class Board extends CanvasObject {
  #attemptFrequency = 100;
  #grid = {
    width: 24,
    height: 20,
    cellSize: 25,
  };
  #allCells = new Map();
  #log = "";
  #enableLogging = true;
  #ticks = 0;

  constructor(canvas) {
    super(canvas);
    for (let row = 0; row < this.#grid.height; row++) {
      for (let col = 0; col < this.#grid.width; col++) {
        this.#allCells.set(
          `${col},${row}`,
          new Cell(canvas, col, row, this.#grid.cellSize)
        );
      }
    }
  }

  solve() {
    setTimeout(() => {
      this.#solveAttempt();
      this.solve();
      if (++this.#ticks % 50) {
        const tiles = this.#refreshAllTiles();
        const anyExplored = tiles.some((tile) => tile !== legend.unexplored);
        if (!anyExplored) {
          const offset = 2;

          this.#getCell(11, 9).reveal();

          this.#getCell(offset, offset).reveal();
          this.#getCell(11, offset).reveal();
          this.#getCell(23 - offset, offset).reveal();

          this.#getCell(offset, 9).reveal();
          this.#getCell(23 - offset, 9).reveal();

          this.#getCell(offset, 19 - offset).reveal();
          this.#getCell(11, 19 - offset).reveal();
          this.#getCell(23 - offset, 19 - offset).reveal();
        }
      }
    }, this.#attemptFrequency);
  }

  #solveAttempt() {
    const cells = [...this.#allCells.values()];
    const unknownTiles = cells.filter((cell) => cell.tile() === legend.unknown);
    const unknownColours = unknownTiles.map((cell) => cell.colour());
    const log = cells.reduce((acc, cell, index) => {
      const delimiter = index % 24 === 0 ? "\n" : " ";
      return `${acc}${delimiter}${cell.tile()}`;
    }, "");

    this.#updateLog(log, unknownTiles, unknownColours);

    const { flaggable, revealable } = this.#findActionableKeys();
    [...flaggable].forEach((key) => this.#getCellByKey(key).flag());
    [...revealable].forEach((key) => this.#getCellByKey(key).reveal());
  }

  #refreshAllTiles() {
    return [...this.#allCells.values()].map((cell) => cell.tile(true));
  }

  #updateLog(log, unknownTiles, unknownColours) {
    if (this.#enableLogging && this.#log !== log) {
      this.#log = log;
      console.log("grid log", log);
      console.log("unknownTiles", unknownTiles);
      console.log("unknownColours", unknownColours);
      console.log("unknownColours unique", new Set(unknownColours));
    }
  }

  #getCellByKey(key) {
    return this.#allCells.get(key);
  }

  #getCell(col, row) {
    const key = `${col},${row}`;
    return this.#getCellByKey(key);
  }

  #findActionableKeys() {
    const withSurrounding = this.#findSurrounding();
    const flaggable = new Set();
    const revealable = new Set();

    withSurrounding.forEach((item) => {
      const possibleMines = item.surrounding.filter((cell) => {
        return [legend.flagged, legend.unexplored].includes(cell.tile());
      });

      if (item.cell.tile() === `${possibleMines.length}`) {
        possibleMines.forEach((cell) => flaggable.add(cell.key()));
      } else {
        const flagged = possibleMines.filter(
          (cell) => cell.tile() === legend.flagged
        );
        const unexplored = possibleMines.filter(
          (cell) => cell.tile() === legend.unexplored
        );
        if (item.cell.tile() === `${flagged.length}`) {
          // Exact number of flags found, so reveal any that are unexplored
          unexplored.forEach((cell) => revealable.add(cell.key()));
        }
      }
    });

    return {
      flaggable,
      revealable,
    };
  }

  #findSurrounding() {
    const relativePos = [
      { dx: -1, dy: -1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 1 },
    ];

    const numberCells = [...this.#allCells.values()].filter(
      ({ tile }) =>
        ![legend.explored, legend.unexplored, legend.flagged].includes(tile)
    );

    const withSurrounding = numberCells
      .map((cell) => {
        const surrounding = relativePos
          .map(({ dx, dy }) => this.#getCell(cell.col + dx, cell.row + dy))
          .filter((cell) => cell);
        return { cell, surrounding };
      })
      .filter(({ surrounding }) => {
        const unsafe = surrounding.some((cell) => {
          return [legend.unknown].includes(cell.tile());
        });

        return !unsafe;
      });

    return withSurrounding;
  }
}
