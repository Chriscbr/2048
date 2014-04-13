function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size           = size; // Size of the grid
  this.inputManager   = new InputManager;
  this.storageManager = new StorageManager;
  this.actuator       = new Actuator;

  this.startTiles     = 4;
  
  this.deckSize       = 2; // 2 per elemental tile = 6 total

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}

// Restart the game
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame(); // Clear the game won/lost message
  this.setup();
};

// Keep playing after winning (allows going over 2048)
GameManager.prototype.keepPlaying = function () {
  this.keepPlaying = true;
  this.actuator.continueGame(); // Clear the game won/lost message
};

// Return true if the game is lost, or has won and the user hasn't kept playing
GameManager.prototype.isGameTerminated = function () {
  if (this.over || (this.won && !this.keepPlaying)) {
    return true;
  } else {
    return false;
  }
};

// Set up the game
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();

  // Reload the game from a previous game if present
  if (previousState) {
    this.grid        = new Grid(previousState.grid.size,
                                previousState.grid.cells); // Reload grid
    this.score       = previousState.score;
    this.over        = previousState.over;
    this.won         = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
    this.deck        = previousState.deck;
    this.nextTile    = previousState.nextTile;
  } else {
    this.grid        = new Grid(this.size);
    this.score       = 0;
    this.over        = false;
    this.won         = false;
    this.keepPlaying = false;
    this.deck        = [];
    this.nextTile    = {selection: 0, type: "grass"};

    // Add the initial tiles
    this.addStartTiles();
  }

  // Update the actuator
  this.actuate();
};

// Set up the initial tiles to start the game with
GameManager.prototype.addStartTiles = function () {
  this.shuffleDeck();
  this.pickNextTile();
  
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

// Adds a tile in a random position
GameManager.prototype.addRandomTile = function (direction) {
  if (this.grid.cellsAvailable()) {
	var type = this.nextTile.type;
	this.deck.splice(this.nextTile.selection, 1); // Remove tile from deck
	var tile;
	
	// Limit spawning position based on swipe direction
	if (direction < 4) {
		var allEmpty = this.grid.availableCells();
		var goodEmpty = [];
		switch (direction) {
			case 0:
              for (var i = 0; i < allEmpty.length; i++) {
			    if (allEmpty[i].y === 3) {
					goodEmpty.push(allEmpty[i]);
				}
			  }
			  break;
			case 1:
			  for (var i = 0; i < allEmpty.length; i++) {
			    if (allEmpty[i].x === 0) {
					goodEmpty.push(allEmpty[i]);
				}
			  }
			  break;
			case 2:
			  for (var i = 0; i < allEmpty.length; i++) {
			    if (allEmpty[i].y === 0) {
					goodEmpty.push(allEmpty[i]);
				}
			  }
			  break;
			case 3:
			  for (var i = 0; i < allEmpty.length; i++) {
			    if (allEmpty[i].x === 3) {
					goodEmpty.push(allEmpty[i]);
				}
			  }
			  break;
			default: break;
		}
		var rand = Math.floor(Math.random() * goodEmpty.length);
		var selected = goodEmpty[rand];
		var tile = new Tile(selected, 1, type);
	} else {
		var tile = new Tile(this.grid.randomAvailableCell(), 1, type);
	}

    this.grid.insertTile(tile);
    
    // Restocks the deck if it is empty
    if (this.deck.length === 0) {
      this.shuffleDeck();
    }
    
    this.pickNextTile();
  }
};

GameManager.prototype.shuffleDeck = function() {
	var i;
	for (i = 0; i < this.deckSize; i++) {
		this.deck.push("grass");
	}
	for (i = 0; i < this.deckSize; i++) {
		this.deck.push("water");
	}
	for (i = 0; i < this.deckSize; i++) {
		this.deck.push("fire");
	}
};

// Chooses the next tile to display above the board
GameManager.prototype.pickNextTile = function() {
  var rand = Math.floor(Math.random() * this.deck.length);
  var chosen = this.deck[rand];
  this.nextTile = {selection: rand, type: chosen};
}

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  if (this.storageManager.getBestScore() < this.score) {
    this.storageManager.setBestScore(this.score);
  }

  // Clear the state when the game is over (game over only, not win)
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }

  this.actuator.actuate(this.grid, {
    score:      this.score,
    over:       this.over,
    won:        this.won,
    bestScore:  this.storageManager.getBestScore(),
    nextTile:   this.nextTile,
    terminated: this.isGameTerminated()
  });

};

// Represent the current game as an object
GameManager.prototype.serialize = function () {
  return {
    grid:        this.grid.serialize(),
    score:       this.score,
    over:        this.over,
    won:         this.won,
    keepPlaying: this.keepPlaying,
	deck:        this.deck,
    nextTile:    this.nextTile
  };
};

// Save all tile positions and remove merger info
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};

// Move a tile and its representation
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};

// Move tiles on the grid in the specified direction
GameManager.prototype.move = function (direction) {
  // 0: up, 1: right, 2: down, 3: left
  var self = this;

  if (this.isGameTerminated()) return; // Don't do anything if the game's over

  var cell, tile;

  var vector     = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved      = false;

  // Save the current tile positions and remove merger information
  this.prepareTiles();

  // Traverse the grid in the right direction and move tiles
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next      = self.grid.cellContent(positions.next);
		var next2     = self.grid.cellContent(positions.next2);

        // Combines types of the same type
        if (next && next.value === tile.value &&
			next.type === tile.type &&
			next.type === "number" &&
			!next.mergedFrom) {
          
		  // Elements don't follow normal "doubling" rules
		  var merged = new Tile(positions.next, tile.value * 2, tile.type);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);

          // Converge the two tiles' positions
          tile.updatePosition(positions.next);

          // Update the score
          self.score += merged.value;

          // The mighty 2048 tile
          if (merged.value === 2048) self.won = true;
        } else if (next && !next.mergedFrom && // Combines different elemental values
                   tile.type !== "number" &&
				   next.type !== "number" &&
		           tile.value === next.value &&
				   ((tile.type === "grass" && next.type === "water") ||
				    (tile.type === "water" && next.type === "fire") ||
					(tile.type === "fire" && next.type === "grass"))) {
	      
		  var merged = new Tile(positions.next, 4, "number");
		  merged.mergedFrom = [tile, next];
		  
		  self.grid.insertTile(merged);
          self.grid.removeTile(tile);
		  
		  // Converge the three tiles' positions
          tile.updatePosition(positions.next);
		  next.updatePosition(positions.next);
		  
		  // Update the score
          self.score += merged.value;
		} else {
          self.moveTile(tile, positions.farthest);
        }

        if (!self.positionsEqual(cell, tile)) {
          moved = true; // The tile moved from its original cell!
        }
      }
    });
  });

  if (moved) {
    this.addRandomTile(direction);
    
    if (!this.movesAvailable()) {
      this.over = true; // Game over!
    }

    this.actuate();
  }
};

// Get the vector representing the chosen direction
GameManager.prototype.getVector = function (direction) {
  // Vectors representing tile movement
  var map = {
    0: { x: 0,  y: -1 }, // Up
    1: { x: 1,  y: 0 },  // Right
    2: { x: 0,  y: 1 },  // Down
    3: { x: -1, y: 0 }   // Left
  };

  return map[direction];
};

// Build a list of positions to traverse in the right order
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };

  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }

  // Always traverse from the farthest cell in the chosen direction
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();

  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;
  var cell2;
  
  // Progress towards the vector direction until an obstacle is found
  do {
    previous = cell;
    cell     = { x: previous.x + vector.x, y: previous.y + vector.y };
	cell2    = { x: previous.x + (2 * vector.x) , y: previous.y + (2 * vector.y) };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));

  return {
    farthest: previous,
    next: cell, // Used to check if a merge is required
	next2: cell2 // Also used to check if a merge is required
  };
};

GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};

// Check for available matches between tiles (more expensive check)
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;

  var tile;

  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };

          var other  = self.grid.cellContent(cell);

          if (other && other.value === tile.value &&
		      ((other.type === "number" && tile.type === "number") || 
			   (other.type !== tile.type && other.type !== "number" && tile.type !== "number"))) {
            return true; // These two tiles can be merged
          }
        }
      }
    }
  }

  return false;
};

GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
