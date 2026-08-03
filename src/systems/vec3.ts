// Un vecteur à trois composantes, et deux fonctions de réglage.
//
// Pourquoi ne pas prendre celui de three.js, qui est déjà là ? Parce qu'il
// n'est déjà là que dans UNE des deux versions du jeu.
//
// La simulation des voyageurs, la foule du quai, la marche, l'assistance à un
// voyageur : tout cela tient des positions, et tout cela n'utilisait de three
// que `Vector3` et deux fonctions de `MathUtils` - `clamp` et `lerp`, six
// lignes d'arithmétique. Le coût était pourtant entier : `import * as THREE`
// dans un module de simulation fait de three.js une dépendance STATIQUE de
// tout ce qui l'appelle, et la chaîne remontait jusqu'à `startGame`, que les
// deux versions chargent. La version sonore téléchargeait donc sept cent
// kilo-octets de moteur de rendu pour ne rien dessiner.
//
// Ce fichier n'est pas une réécriture de `THREE.Vector3` : c'est le
// sous-ensemble réellement appelé par la simulation, et rien de plus. Les
// vecteurs qui en sortent restent parfaitement utilisables par three - toutes
// ses méthodes acceptent un `Vector3Like`, c'est-à-dire n'importe quel objet
// qui a un `x`, un `y` et un `z`, et c'est exactement ce que ceux-ci sont.
// Le rendu continue donc de faire `mesh.position.copy(pax.pos)` sans rien
// savoir de tout ceci.

/** Ramène `v` entre `min` et `max`. Identique à `THREE.MathUtils.clamp`. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Interpolation linéaire, identique à `THREE.MathUtils.lerp`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ce qu'il faut avoir pour être lu comme un point : trois nombres. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export class Vec3 implements Vec3Like {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setScalar(v: number): this {
    return this.set(v, v, v);
  }

  copy(v: Vec3Like): this {
    return this.set(v.x, v.y, v.z);
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  add(v: Vec3Like): this {
    return this.set(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  addScaledVector(v: Vec3Like, s: number): this {
    return this.set(this.x + v.x * s, this.y + v.y * s, this.z + v.z * s);
  }

  addVectors(a: Vec3Like, b: Vec3Like): this {
    return this.set(a.x + b.x, a.y + b.y, a.z + b.z);
  }

  sub(v: Vec3Like): this {
    return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  subVectors(a: Vec3Like, b: Vec3Like): this {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  multiplyScalar(s: number): this {
    return this.set(this.x * s, this.y * s, this.z * s);
  }

  divideScalar(s: number): this {
    return this.multiplyScalar(s === 0 ? 0 : 1 / s);
  }

  negate(): this {
    return this.set(-this.x, -this.y, -this.z);
  }

  dot(v: Vec3Like): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  length(): number {
    return Math.sqrt(this.lengthSq());
  }

  /** Un vecteur nul reste nul : pas de division par zéro, pas de NaN. */
  normalize(): this {
    return this.divideScalar(this.length());
  }

  setLength(l: number): this {
    return this.normalize().multiplyScalar(l);
  }

  distanceToSquared(v: Vec3Like): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    const dz = this.z - v.z;
    return dx * dx + dy * dy + dz * dz;
  }

  distanceTo(v: Vec3Like): number {
    return Math.sqrt(this.distanceToSquared(v));
  }

  lerp(v: Vec3Like, t: number): this {
    return this.set(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t,
    );
  }

  lerpVectors(a: Vec3Like, b: Vec3Like, t: number): this {
    return this.set(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t,
      a.z + (b.z - a.z) * t,
    );
  }

  equals(v: Vec3Like): boolean {
    return this.x === v.x && this.y === v.y && this.z === v.z;
  }
}
