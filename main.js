function loadAsset(src) {
  return new Promise(resolve => {
    const img = new Image;
    img.onload = () => resolve(img);
    img.src = src;
  });
}

customElements.define(
  'game-object',
  class GameObject extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            
            transition: transform 0.1s ease-out;
            display: block;
            position: absolute;
            top: 0;
            left: 0;
          }

          :host([right]) {
            left: auto;
            right: 0;
          }

          :host([bottom]) {
            top: auto;
            bottom: 0;
          }

          :host([fixed]) {
            position: fixed;
          }
        </style>
        <slot></slot>
      `;
    }

    destroy() {
      this.parentElement.removeChild(this);
    }
  }
)

customElements.define(
  'entity-transform',
  class EntityTransform extends HTMLElement {
    static get observedAttributes() {
      return ['x', 'y'];
    }

    constructor() {
      super();
      this._x = -1;
      this._y = -1;
    }

    attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case 'x': {
          this._x = parseInt(newValue);
          this._updateTransform();
          return;
        }
        case 'y': {
          this._y = parseInt(newValue);
          this._updateTransform();
          return;
        }
      }
    }

    get x() { return this._x }
    set x(val) {
      this.setAttribute('x', val);
    }

    get y() { return this._y }
    set y(val) {
      this.setAttribute('y', val);
    }

    _updateTransform() {
      if (!this.parentElement) return;
      const el = this.parentElement;
      el.style.transform = `translate(${this.x * TILE_SIZE}px, ${this.y * TILE_SIZE}px)`;
    }

    connectedCallback() {
      this.parentElement.transform = this;
      this._updateTransform();
    }
  }
);

const TerrainType = {
  Plain:         0,
  Road:     1 << 0,
  Floor:    1 << 1,
  Forest:   1 << 2,
  Mountain: 1 << 3,
  Wall:     1 << 4,
  River:    1 << 5,
  Beach:    1 << 6,
  Sea:      1 << 7,
  DeepSea:  1 << 8,
  Reef:     1 << 9,
  Bridge:   1 << 10,
};

const CharToTerrainType = {
  '.': TerrainType.Plain,
  ',': TerrainType.Road,
  '_': TerrainType.Floor,
  '^': TerrainType.Mountain,
  'T': TerrainType.Forest,
  '#': TerrainType.Wall,
  '~': TerrainType.River,
  '/': TerrainType.Beach,
  'u': TerrainType.Sea,
  'w': TerrainType.DeepSea,
  'x': TerrainType.Reef,
  '=': TerrainType.Bridge,
};

const TerrainTypeToColor = new Map([
  [TerrainType.Plain,     'rgb(126, 211, 33)'],
  [TerrainType.Road,      'rgb(230, 227, 161)'],
  [TerrainType.Floor,     'rgb(191, 198, 201)'],
  [TerrainType.Forest,    'rgb(30, 125, 51)'],
  [TerrainType.Mountain,  'rgb(102, 91, 86)'],
  [TerrainType.Wall,      'rgb(125, 126, 128)'],
  [TerrainType.River,     'rgb(119, 184, 237)'],
  [TerrainType.Beach,     'rgb(252, 252, 204)'],
  [TerrainType.Sea,       'rgb(35, 167, 204)'],
  [TerrainType.DeepSea,   'rgb(16, 79, 161)'],
  [TerrainType.Reef,      'rgb(84, 165, 168)'],
  [TerrainType.Bridge,    'rgb(181, 123, 72)'],
]);

const TerrainTypeToDefenseModifier = new Map([
  [TerrainType.Plain,     +.1],
  [TerrainType.Road,        0],
  [TerrainType.Floor,       0],
  [TerrainType.Forest,    +.3],
  [TerrainType.Mountain,  +.4],
  [TerrainType.Wall,      +.4],
  [TerrainType.River,     -.2],
  [TerrainType.Beach,     -.1],
  [TerrainType.Sea,       +.1],
  [TerrainType.DeepSea,     0],
  [TerrainType.Reef,      +.2],
  [TerrainType.Bridge,      0],
]);

const TerrainTypeToImageAsset = new Map([
  [TerrainType.Forest,    loadAsset('forest.png')],
  [TerrainType.Mountain,  loadAsset('mountain.png')],
]);

const assetLoader = Promise.all(TerrainTypeToImageAsset.values());

const TerrainTypeToName = new Map(Object.keys(TerrainType).map(name => [TerrainType[name], name]));

function getTerrainMoveCost(unit, terrainType) {
  switch (terrainType) {
    case TerrainType.Plain:
    case TerrainType.Road:
    case TerrainType.Floor:
    case TerrainType.Bridge:
      return 1;
    case TerrainType.Forest:
    case TerrainType.River:
    case TerrainType.Beach:
      return 2;
    case TerrainType.Mountain:
      return 3;
    default:
      return Infinity;
  }
}

function calculateDamage(attacker, defenderTerrain) {
  let damage = attacker.health / 2;
  damage -= damage * (TerrainTypeToDefenseModifier.get(defenderTerrain) || 0);
  damage += damage * (Math.random() - .5);
  return Math.round(damage);
}

customElements.define(
  'web-groove',
  class WebGroove extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            position: relative;
          }
        </style>

        <slot></slot>
      `;

      this.addEventListener('set-level-cursor', e => {
        const { x, y } = e.target.parentElement.transform;
        const entity = this.queryUnitAtPosition(x, y);

        if (this.entity) {
          this.entity.classList.remove('cursor-hover');
        }
        this.entity = entity;
        if (entity) {
          entity.classList.add('cursor-hover');
        }
        if (this.entitySelectedForMovement) {
          this.querySelector('unit-display').setUnit(this.entitySelectedForMovement);
        } else {
          this.querySelector('unit-display').setUnit(entity);
        }

        const terrain = this.querySelector('level-terrain');
        const display = this.querySelector('terrain-display');
        if (terrain && display) {
          const terrainType = terrain.getTerrainType(x, y);
          display.setTerrain(terrainType);
        }
      });

      window.addEventListener('keydown', event => {
        switch (event.key) {
          case ' ': return this.activateCursor();
        }
      });
    }

    activateCursor() {
      const cursor = this.querySelector('level-cursor');
      if (!cursor) return;
      const { x, y } = cursor.parentElement.transform;

      if (this.entitySelectedForAttack) {
        const moveArea = this.querySelector('unit-move-area');
        let loc = moveArea.getReachableLocation(x, y);

        if (loc && loc.entity) {
          // TODO range
          const terrain = this.querySelector('level-terrain');
          const defender = loc.entity;

          const attacker = this.entitySelectedForAttack;
          const defenderTerrain = terrain.getTerrainType(loc.x, loc.y);
          defender.takeDamage(calculateDamage(attacker, defenderTerrain));

          if (defender.health) {
            const attackerTerrain = terrain.getTerrainType(
              attacker.parentElement.transform.x, attacker.parentElement.transform.y
            );
            attacker.takeDamage(calculateDamage(defender, attackerTerrain));
          }
        }

        moveArea.clearMoveArea();
        this.entitySelectedForAttack = null;
      } else if (this.entitySelectedForMovement) {
        const moveArea = this.querySelector('unit-move-area');
        let loc = moveArea.getReachableLocation(x, y);

        if (loc) {
          const moves = [];
          while (loc.from) {
            moves.push(loc);
            loc = loc.from;
          }
          const unit = this.entitySelectedForMovement;
          const moveTransform = this.entitySelectedForMovement.parentElement.transform;
          if (!moves.length || !moveTransform) {
            this.checkForAttackTargets(unit);
            this.entitySelectedForMovement = null;
            return;
          }
          // TODO lock interaction
          let interval = setInterval(() => {
            const loc = moves.pop();
            moveTransform.x = loc.x;
            moveTransform.y = loc.y;
            if (!moves.length) {
              clearInterval(interval);
              // TODO lock
              this.checkForAttackTargets(unit);
            }
          }, 100);
        }

        moveArea.clearMoveArea();
        this.entitySelectedForMovement = null;
      } else {
        const entity = this.queryUnitAtPosition(x, y);
        if (!entity) return;
        this.entitySelectedForMovement = entity;
        const terrain = this.querySelector('level-terrain');
        this.querySelector('unit-move-area').showMoveAreaForUnit(entity, terrain, this);
      }
    }

    checkForAttackTargets(unit) {
      const terrain = this.querySelector('level-terrain');
      const moveArea = this.querySelector('unit-move-area');
      moveArea.showAttackAreaForUnit(unit, terrain, this);
      if (moveArea.reachable.size) {
        this.entitySelectedForAttack = unit;
      } else {
        moveArea.clearMoveArea();
      }
    }

    queryUnitAtPosition(x, y) {
      const query = `entity-transform[x="${x}"][y="${y}"] ~ unit-entity`;
      return this.querySelector(query);
    }
  }
);

function parseLevelString(levelString) {
  return levelString.trim().split('\n').map(rowString => rowString.trim().split('').map(char =>
    CharToTerrainType[char] || TerrainType.Plain
  ));
}

const TILE_SIZE = 50;

customElements.define(
  'level-terrain',
  class LevelTerrain extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.shadowRoot.appendChild(this.canvas);
    }

    static get observedAttributes() {
      return ['level-string'];
    }
    
    attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case 'level-string': {
          const parsed = parseLevelString(newValue);
          this.updateTerrain(parsed);
          return;
        }
      }
    }

    async updateTerrain(parsedLevel) {
      this.parsedLevel = parsedLevel;

      await assetLoader;

      const width = parsedLevel[0].length;
      const height = parsedLevel.length;

      this.width = width;
      this.height = height;
      const SCALE = TILE_SIZE * 2;
      this.canvas.width = width * SCALE;
      this.canvas.height = height * SCALE;
      this.canvas.style.width = width * TILE_SIZE + 'px';
      this.canvas.style.height = height * TILE_SIZE + 'px';

      for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const terrain = parsedLevel[y][x];
        const img = await TerrainTypeToImageAsset.get(terrain);
        const color = TerrainTypeToColor.get(terrain);

        if (img) {
          const imgWidth = img.width;
          const imgHeight = img.height;
          const imgOverlap = imgHeight - imgWidth;
          const ratio = SCALE / imgWidth;
          const yOffset = imgOverlap * ratio;
          this.ctx.drawImage(img, x * SCALE, y * SCALE - yOffset, SCALE, SCALE + yOffset);
        } else {
          this.ctx.fillStyle = color;
          this.ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    }

    getTerrainType(x, y) {
      if (!this.parsedLevel[y]) return -1;
      return this.parsedLevel[y][x];
    }
  }
);

customElements.define(
  'level-cursor',
  class LevelCursor extends HTMLElement {
    constructor() {
      super();
      this.handleKeydown = this.handleKeydown.bind(this);

      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            border: 4px solid white;
            border-radius: 4px;
            box-sizing: border-box;
            width: ${TILE_SIZE}px;
            height: ${TILE_SIZE}px;
            transition: transform 0.1s ease-out;
            display: block;
          }
        </style>
      `;
    }

    connectedCallback() {
      window.addEventListener('keydown', this.handleKeydown);
      this.dispatchEvent(new CustomEvent('set-level-cursor', {
        bubbles: true,
        composed: true,
      }));
    }

    disonnectedCallback() {
      window.removeEventListener('keydown', this.handleKeydown);
    }

    handleKeydown(event) {
      let handled = true;

      if (!this.parentElement.transform) {
        handled = false;
        return;
      }

      try {
        switch (event.key) {
          case 'ArrowUp':     return this.parentElement.transform.y -= 1;
          case 'ArrowDown':   return this.parentElement.transform.y += 1;
          case 'ArrowLeft':   return this.parentElement.transform.x -= 1;
          case 'ArrowRight':  return this.parentElement.transform.x += 1;
          default:            return handled = false;
        }
      } finally {
        if (handled) {
          this.dispatchEvent(new CustomEvent('set-level-cursor', {
            bubbles: true,
            composed: true,
          }));
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  }
);

customElements.define(
  'unit-entity',
  class UnitEntity extends HTMLElement {
    static get observedAttributes() {
      return ['player'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            position: relative;
            top: ${TILE_SIZE / 4}px;
            left: ${TILE_SIZE / 4}px;
            width: ${TILE_SIZE / 2}px;
            height: ${TILE_SIZE / 2}px;

            border-radius: 8px;
          }

          :host([player="1"]) {
            background-color: red;
          }

          :host([player="2"]) {
            background-color: blue;
          }

          span {
            position: absolute;
            top: -5px;
            right: -5px;
            font-size: 12px;
            background: white;
            width: 1em;
            text-align: center;
            border-radius: 25%;
            border: 1px solid #ccc;
          }
        </style>
      `;

      this.health = 100;
      this.healthBadge = document.createElement('span');
      this.healthBadge.style.display = 'none';
      this.shadowRoot.appendChild(this.healthBadge);
    }

    takeDamage(damage) {
      this.health = Math.round(this.health - damage);
      this.dispatchEvent(new CustomEvent('unit-health-change', {
        bubbles: true,
        composed: true,
      }));

      if (this.health <= 0) {
        this.parentElement.destroy();
      } else {
        const shortHealth = Math.max(1, Math.round(this.health / 10));
        if (shortHealth < 10) {
          this.healthBadge.innerText = shortHealth;
          this.healthBadge.style.display = 'block';
        }
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case 'player': {
          this.player = parseInt(newValue);
          return;
        }
      }
    }
  }
);

customElements.define(
  'terrain-display',
  class TerrainDisplay extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            background-color: #eee;
            border-radius: 8px;
            padding: 8px;
            margin: 5px;
            border: 1px solid;
          }
        </style>
      `;
      this.name = document.createElement('h2');
      this.shadowRoot.appendChild(this.name);
    }

    setTerrain(terrain) {
      this.name.innerText = TerrainTypeToName.get(terrain) || 'Unknown';
    }
  }
);

customElements.define(
  'unit-display',
  class TerrainDisplay extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            background-color: #eee;
            border-radius: 8px;
            padding: 8px;
            margin: 5px;
            border: 1px solid;
          }
        </style>
      `;
      this.name = document.createElement('h2');
      this.shadowRoot.appendChild(this.name);
      this.health = document.createElement('span');
      this.shadowRoot.appendChild(this.health);

      this.updateUnit = this.updateUnit.bind(this);
    }

    setUnit(unit) {
      if (!unit) {
        this.style.display = 'none';
      } else {
        if (this.unit && this.unit !== unit) {
          this.unit.removeEventListener('unit-health-change', this.updateUnit);
        }
        
        this.unit = unit;
        this.unit.addEventListener('unit-health-change', this.updateUnit);

        this.name.innerText = 'Player: ' + unit.player;
        this.style.display = 'block';
        this.health.innerText = `Health: ${ unit.health }%`;
      }
    }

    updateUnit(event) {
      if (event.target.health > 0) {
        this.setUnit(event.target);
      } else {
        this.setUnit();
      }
    }
  }
);

customElements.define(
  'unit-move-area',
  class UnitMoveArea extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.shadowRoot.appendChild(this.canvas);
    }

    getReachableLocation(x, y) {
      if (!this.reachable) return false;
      
      return this.reachable.get(`${x}_${y}`);
    }

    clearMoveArea() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.reachable = null;
    }

    showMoveAreaForUnit(unit, map, ctrl) {
      const { x, y } = unit.parentElement.transform;

      const maxRange = 4; // TODO

      const visited = new Map();
      const visitQueue = [];

      this.canvas.width = map.width * TILE_SIZE;
      this.canvas.height = map.height * TILE_SIZE;

      this.ctx.clearRect(0, 0, map.width, map.height);
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillStyle = 'cyan';
      this.ctx.strokeStyle = 'blue';
      this.ctx.lineWidth = 4;

      // TODO used by the debug drawing 
      // const ctx = this.ctx;

      visit({ x, y, step: 0 });

      while (visitQueue.length) {
        const item = visitQueue.pop();
        visitNeighbors(item);
      }

      for (let loc of visited.values()) {
        if (loc.entity && loc.entity !== unit ) {
          // Delete tiles from the set that are already occupied by own units.
          // They're left in to allow moving _through_ them.
          visited.delete(`${loc.x}_${loc.y}`);
        } else {
          this.ctx.fillRect(loc.x * TILE_SIZE, loc.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          this.ctx.strokeRect(loc.x * TILE_SIZE, loc.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      this.reachable = visited;

      function visit(loc, from) {
        const key = `${loc.x}_${loc.y}`;
        const existing = visited.get(key);
        if (!existing || existing.step > loc.step) {
          // TODO perf
          const entity = existing ? existing.entity : ctrl.queryUnitAtPosition(loc.x, loc.y);
          // Don't allow moving through enemy units;
          if (entity && entity.player !== unit.player) return;
          loc.entity = entity;
          loc.from = from;
          visited.set(key, loc);
          visitQueue.push(loc);

          // if (from) {
          //   ctx.beginPath();
          //   ctx.moveTo(from.x * TILE_SIZE + (TILE_SIZE / 2), from.y * TILE_SIZE + (TILE_SIZE / 2));
          //   ctx.lineTo(loc.x * TILE_SIZE + (TILE_SIZE / 2), loc.y * TILE_SIZE + (TILE_SIZE / 2));
          //   ctx.stroke();
          //   ctx.closePath();
          // }
        }
      }

      function visitNeighbors(from) {
        const { x, y, step } = from;
        if (x > 0) {
          const moveCost = getTerrainMoveCost(unit, map.getTerrainType(x - 1, y));
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x: x - 1, y, step: nextStep }, from);
        }
        if (x + 1 < map.width) {
          const moveCost = getTerrainMoveCost(unit, map.getTerrainType(x + 1, y));
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x: x + 1, y, step: nextStep }, from);
        }
        if (y > 0) {
          const moveCost = getTerrainMoveCost(unit, map.getTerrainType(x, y - 1));
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x, y: y - 1, step: nextStep }, from);
        }
        if (y + 1 < map.height) {
          const moveCost = getTerrainMoveCost(unit, map.getTerrainType(x, y + 1));
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x, y: y + 1, step: nextStep }, from);
        }
      }
    }

    showAttackAreaForUnit(unit, map, ctrl) {
      const { x, y } = unit.parentElement.transform;

      const maxRange = 1; // TODO

      const visited = new Map();
      const visitQueue = [];

      this.canvas.width = map.width * TILE_SIZE;
      this.canvas.height = map.height * TILE_SIZE;

      this.ctx.clearRect(0, 0, map.width, map.height);
      this.ctx.globalAlpha = 0.3;
      this.ctx.fillStyle = 'orange';
      this.ctx.strokeStyle = 'red';
      this.ctx.lineWidth = 4;

      visit({ x, y, step: 0 });

      while (visitQueue.length) {
        const item = visitQueue.pop();
        visitNeighbors(item);
      }

      for (let loc of visited.values()) {
        if (!loc.entity || loc.entity.player === unit.player ) {
          // Delete all tiles that are either empty or have non-attackable units
          visited.delete(`${loc.x}_${loc.y}`);
        } else {
          this.ctx.fillRect(loc.x * TILE_SIZE, loc.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          this.ctx.strokeRect(loc.x * TILE_SIZE, loc.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }

      this.reachable = visited;

      function visit(loc, from) {
        const key = `${loc.x}_${loc.y}`;
        const existing = visited.get(key);
        if (!existing || existing.step > loc.step) {
          // TODO perf
          const entity = existing ? existing.entity : ctrl.queryUnitAtPosition(loc.x, loc.y);
          loc.entity = entity;
          loc.from = from;
          visited.set(key, loc);
          visitQueue.push(loc);
        }
      }

      function visitNeighbors(from) {
        const { x, y, step } = from;
        if (x > 0) {
          const moveCost = 1;
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x: x - 1, y, step: nextStep }, from);
        }
        if (x + 1 < map.width) {
          const moveCost = 1;
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x: x + 1, y, step: nextStep }, from);
        }
        if (y > 0) {
          const moveCost = 1;
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x, y: y - 1, step: nextStep }, from);
        }
        if (y + 1 < map.height) {
          const moveCost = 1;
          const nextStep = step + moveCost;
          if (nextStep <= maxRange) visit({ x, y: y + 1, step: nextStep }, from);
        }
      }
    }
  }
);
