import { CircuitValue, prop } from './circuit_value';
import { Bool, Field, Circuit, Poseidon, AsFieldElements, NumberAsField } from '../snarky';
import { Optional } from './optional';
import { DataStore, KeyedDataStore } from './data_store';

let indexId = 0;

/*
export interface IndexedAccumulatorI<A, P> {
  store: DataStore<A, P> | null,
  check: (comm: Field, index: Index, a: A, proof: P) => Bool,
}
  */

export class AccumulatorMembershipProof extends CircuitValue {
  @prop merkleProof: MerkleProof;
  @prop index: Index;

  constructor(merkleProof: MerkleProof, index: Index) {
    super();
    this.merkleProof = merkleProof;
    this.index = index;
  }

  verify<T extends CircuitValue>(commitment: Field, x: T): Bool {
    let leaf = Poseidon.hash(x.toFieldElements());
    return this.merkleProof.verify(commitment, this.index, leaf);
  }
}

/*
export interface AccumulatorI<A, P> {
  commitment: () => Field,
  check: (x: A, membershipProof: P) => Bool,
  add: (x: A) => P,
  getMembershipProof: (x: A) => P | null,
}
  */

export function MerkleAccumulatorFactory<A extends CircuitValue>(depth: number) {
  const I = Index[depth];
  const P = MerkleProof[depth];

  return class MerkleAccumulator {
    root: Field;
    _store: DataStore<A, MerkleProof> | null;

    constructor(root: Field) {
      this.root = root;
      this._store = null;
    }

    static fromStore(s: DataStore<A, MerkleProof>): MerkleAccumulator {
      const a = new MerkleAccumulator(s.commitment());
      a.store = s;
      return a;
    }

    static sizeInFieldElements(): number {
      return 1;
    }
    
    static toFieldElements(x: MerkleAccumulator): Field[] {
      return [x.root]
    }
    
    static ofFieldElements(xs: Field[]): MerkleAccumulator {
      return new MerkleAccumulator(xs[0])
    }
    
    toFieldElements(): Field[] {
      return MerkleAccumulator.toFieldElements(this);
    }

    get store(): DataStore<A, MerkleProof> {
      if (this._store === null) {
        throw new Error('MerkleAccumulator.store not set');
      } else {
        return this._store;
      }
    }
    
    set store(s: DataStore<A, MerkleProof>) {
      if (s.depth !== depth) {
        throw new Error(`Store had depth ${s.depth} but contract expects ${depth}`);
      }
      this._store = s;
    }

    commitment() {
      return this.root;
    }

    check(x: A, p: AccumulatorMembershipProof): Bool {
      return p.verify(this.commitment(), x);
    }

    // Happens outside the circuit
    getMembershipProof(x: A): AccumulatorMembershipProof | null {
      const idx = this.store.getIndex(x);
      if (idx === null) {
        return null;
      } else {
        return new AccumulatorMembershipProof(this.store.getProof(idx), idx);
      }
    }
    
    add(x: A): AccumulatorMembershipProof {
      let idx = Circuit.witness(I, () => this.store.nextIndex());
      let path = Circuit.witness(P, () => this.store.getProof(idx));
      
      // Checks that this is a path to an empty leaf
      impliedRoot(idx.value, path.path, emptyHash(0)).assertEquals(this.root);

      const newLeaf = Poseidon.hash(x.toFieldElements());
      this.root = impliedRoot(idx.value, path.path, newLeaf);

      if (Circuit.inProver()) {
        Circuit.asProver(() => {
          this.store.set(idx, x);
        });
      } else {
        this.store.set(idx, x);
      }
      
      return new AccumulatorMembershipProof(path, idx);
    }
  }
}

/*
class MerkleAccumulator<A extends CircuitValue> extends CircuitValue {
  @prop root: Field;
  _store: DataStore<A, MerkleProof> | null;
  
  constructor(root: Field) {
    super();
    this.root = root;
    this._store = null;
  }
  
  get store(): DataStore<A, MerkleProof> {
    if (this._store === null) {
      throw new Error('MerkleAccumulator.store not set');
    } else {
      return this._store;
    }
  }
  
  set store(s: DataStore<A, MerkleProof>) {
    this._store = s;
  }

  commitment() {
    return this.root;
  }

  check(x: A, p: AccumulatorMembershipProof): Bool {
    return p.verify(this.commitment(), x);
  }

  // Happens outside the circuit
  getMembershipProof(x: A): AccumulatorMembershipProof | null {
    const idx = this.store.getIndex(x);
    if (idx === null) {
      return null;
    } else {
      return new AccumulatorMembershipProof(this.store.getProof(idx), idx);
    }
  }
  
  add(x: A): AccumulatorMembershipProof {
    const I = Index[this.store.depth];
    const P = MerkleProof[this.store.depth];

    let idx = Circuit.witness(I, () => this.store.nextIndex());
    let path = Circuit.witness(P, () => this.store.getProof(idx));
    
    // Checks that this is a path to an empty leaf
    impliedRoot(idx.value, path.path, emptyHash(0)).assertEquals(this.root);

    const newLeaf = Poseidon.hash(x.toFieldElements());
    this.root = impliedRoot(idx.value, path.path, newLeaf);

    if (Circuit.inProver()) {
      Circuit.asProver(() => {
        this.store.set(idx, x);
      });
    } else {
      this.store.set(idx, x);
    }
    
    return new AccumulatorMembershipProof(path, idx);
  }
} */

/*
export function MerkleAccumulatorFactory<A extends CircuitValue>(
  store: DataStore<A, MerkleProof>
  ) {
  return class MerkleAccumulator {
    root: Field

    commitment() {
      return this.root;
    }

    check(x: A, p: AccumulatorMembershipProof): Bool {
      return p.verify(this.commitment(), x);
    }

    // Happens outside the circuit
    getMembershipProof(x: A): AccumulatorMembershipProof | null {
      const idx = store.getIndex(x);
      if (idx === null) {
        return null;
      } else {
        return new AccumulatorMembershipProof(store.getProof(idx), idx);
      }
    }
    
    add(x: A): AccumulatorMembershipProof {
      const I = Index[store.depth];
      const P = MerkleProof[store.depth];

      let idx = Circuit.witness(I, () => store.nextIndex());
      let path = Circuit.witness(P, () => store.getProof(idx));
      
      // Checks that this is a path to an empty leaf
      impliedRoot(idx.value, path.path, emptyHash(0)).assertEquals(this.root);

      const newLeaf = Poseidon.hash(x.toFieldElements());
      this.root = impliedRoot(idx.value, path.path, newLeaf);

      if (Circuit.inProver()) {
        Circuit.asProver(() => {
          store.set(idx, x);
        });
      } else {
        store.set(idx, x);
      }
      
      return new AccumulatorMembershipProof(path, idx);
    }

    constructor(root: Field) {
      this.root = root;
    }

    static toFieldElements(x: MerkleAccumulator): Field[] {
      return [x.root]
    }

    static ofFieldElements(x: Field[]) {
      new MerkleAccumulator(x[0]);
    }
    
    static sizeInFieldElements(): number {
      return 1;
    }
    
    toFieldElements(): Field[] {
      return MerkleAccumulator.toFieldElements(this);
    }
  };
}

/*
export function MerkleAccumulator<A>()
: AccumulatorI<A, AccumulatorMembershipProof> {
  throw 'todo'
} */

export abstract class IndexedAccumulator<A> extends CircuitValue {
  @prop commitment: Field;

  constructor(commitment: Field) {
    super()
    this.commitment = commitment;
  }

  abstract set(index: Index, a: A): void

  abstract get(index: Index): A
}

export function KeyedAccumulatorFactory<K extends CircuitValue, V extends CircuitValue>(depth: number) {
  const I = Index[depth];
  const P = MerkleProof[depth];

  return class KeyedAccumulator {
    root: Field;
    _store: KeyedDataStore<K, V, MerkleProof> | null;
    key: (v: V) => K;
    cachedPaths: Map<IndexId, Array<Field>>;
    cachedValues: Map<IndexId, { value: V; hash: Field }>;

    constructor(root: Field) {
      this.root = root;
      this._store = null;
      this.cachedPaths = new Map();
      this.cachedValues = new Map();
      this.key = (_: V) => { throw new Error('uninitialized'); };
    }

    static create(key: (v: V) => K, store: KeyedDataStore<K, V, MerkleProof>) {
      const a = new KeyedAccumulator(store.commitment());
      a._store = store;
      return a;
    }

    static sizeInFieldElements(): number {
      return 1;
    }
    
    static toFieldElements(x: KeyedAccumulator): Field[] {
      return [x.root]
    }
    
    static ofFieldElements(xs: Field[]): KeyedAccumulator {
      return new KeyedAccumulator(xs[0])
    }
    
    toFieldElements(): Field[] {
      return KeyedAccumulator.toFieldElements(this);
    }

    get store(): KeyedDataStore<K, V, MerkleProof> {
      if (this._store === null) {
        throw new Error('MerkleAccumulator.store not set');
      } else {
        return this._store;
      }
    }
    
    set store(s: KeyedDataStore<K, V, MerkleProof>) {
      if (s.depth !== depth) {
        throw new Error(`Store had depth ${s.depth} but contract expects ${depth}`);
      }
      this._store = s;
    }

    commitment() {
      return this.root;
    }

    /*
    check(x: A, p: AccumulatorMembershipProof): Bool {
      return p.verify(this.commitment(), x);
    }
    */

    // TODO: Make this work
    set(proof: AccumulatorMembershipProof, value: V): void {
      this.store.setValue(this.key(value), value);
    }

    // TODO: Rework this to work INSIDE the circuit
    get(key: K): [Optional<V>, AccumulatorMembershipProof] {
      let idx_ = this.store.getIndex(key);
      let isSome = new Bool(idx_ !== null);
      let idx: Index = idx_ === null ? this.store.nextIndex() : idx_;

      let { value, empty} = this.store.getValue(key);
      // TODO: empty should equal not isSome

      const o = new Optional(isSome, value);
      const p = this.store.getProof(idx);
      return [o, new AccumulatorMembershipProof(p, idx)];
    }
  }
}

/*
export class KeyedAccumulator<K, V> extends CircuitValue {
  store: KeyedDataStore<K, V, MerkleProof>;

  cachedPaths: Map<IndexId, Array<Field>>;
  cachedValues: Map<IndexId, { value: A; hash: Field }>;

  set(key: K, value: V): void {
    throw 'todo'
  }

  get(key: K): Optional<V> {
    throw 'todo';
  }

  commitment(): Field {
    throw 'todo';
  }

  constructor(key: (v: V) => K, store: KeyedDataStore<V, AccumulatorMembershipProof>) {
    super();
  }
}
*/

/*
export function DataAvailableIndexedAccumulator<A, P>(C) {
} */

/*
export function IndexedAccumulatorFactory<A, P>(
  acc: IndexedAccumulatorI<A, P>,
  eltTyp: AsFieldElements<A>,
  proofTyp: AsFieldElements<P>) {
    let getStore = () => {
      if (acc.store == null) {
        throw new Error('store not available')
      }
      return acc.store;
    };

    return class Acc extends IndexedAccumulator<A> {
      get(index: Index): A {
        let aPre = Circuit.witness(eltTyp, () => getStore().getValue(index));
        let proof = Circuit.witness(proofTyp, () => getStore().getProof(index));
        acc.check(this.commitment, index, aPre, proof);
        return aPre;
      }

      set(index: Index, a: A) {
        let aPre = Circuit.witness(eltTyp, () => getStore().getValue(index));
        let proof = Circuit.witness(proofTyp, () => getStore().getProof(index));
        let commPre = this.commitment;
        acc.check(commPre, index, aPre, proof);
        let commPost = Circuit.witness(Field, () => {
          let s = getStore();
          s.set(index, a);
          return s.commitment();
        })
        acc.check(commPost, index, a, proof);
        this.commitment = commPost;
      }
    }
} */

export class IndexBase {
  id: IndexId;
  value: Array<Bool>;

  constructor(value: Array<Bool>) {
    this.value = value;
    this.id = indexId++;
  }
}

class MerkleProofBase {
  path: Array<Field>;

  constructor(path: Array<Field>) {
    this.path = path;
  }

  verify(root: Field, index: Index, leaf: Field): Bool {
    return root.equals(impliedRoot(index.value, this.path, leaf));
  }

  assertVerifies(root: Field, index: Index, leaf: Field): void {
    checkMerklePath(root, index.value, this.path, leaf);
  }
}

export function MerkleProofFactory(depth: number) {
  return class MerkleProof extends MerkleProofBase {
    constructor(path: Array<Field>) {
      super(path);
    }

    static sizeInFieldElements(): number {
      return depth;
    }

    static toFieldElements(x: MerkleProof): Array<Field> {
      return x.path;
    }

    static ofFieldElements(xs: Array<Field>): MerkleProof {
      if (xs.length !== depth) {
        throw new Error(
          `MerkleTree: ofFieldElements expected array of length ${depth}, got ${xs.length}`
        );
      }
      return new MerkleProof(xs);
    }
  };
}

export function IndexFactory(depth: number) {
  return class Index extends IndexBase {
    constructor(value: Array<Bool>) {
      super(value);
    }

    static sizeInFieldElements(): number {
      return depth;
    }

    static fromInt(n: number): Index {
      if (n >= 1 << depth) {
        throw new Error('Index is too large');
      }
      let res = [];
      for (let i = 0; i < depth; ++i) {
        res.push(new Bool(((n >> i) & 1) === 1));
      }
      return new Index(res);
    }

    static ofFieldElements(xs: Field[]): Index {
      return new Index(xs.map((x) => Bool.Unsafe.ofField(x)));
    }
    
    toFieldElements(): Field[] {
      return Index.toFieldElements(this);
    }

    static toFieldElements(i: Index): Field[] {
      return i.value.map((b) => b.toField());
    }

    static check(i: Index) {
      i.value.forEach((b) => b.toField().assertBoolean());
    }
  };
}

type Constructor<T> = { new (...args: any[]): T };

function range(n: number): Array<number> {
  let res = [];
  for (let i = 0; i < n; ++i) {
    res.push(i);
  }
  return res;
}

export const MerkleProof = range(128).map(MerkleProofFactory);
export const Index = range(128).map(IndexFactory);
export type MerkleProof = InstanceType<typeof MerkleProof[0]>;
export type Index = InstanceType<typeof Index[0]>;

// TODO: Put better value
const emptyHashes: Field[] = [];

function emptyHash(depth: number): Field {
  if (emptyHashes.length === 0) emptyHashes.push(new Field(1234561789));
  if (depth >= emptyHashes.length) {
    for (let i = emptyHashes.length; i < depth + 1; ++i) {
      const h = emptyHashes[i - 1];
      emptyHashes.push(Poseidon.hash([h, h]));
    }
  }

  return emptyHashes[depth];
}

type IndexId = number;

type BinTree<A> =
  | { kind: 'empty'; hash: Field; depth: number }
  | { kind: 'leaf'; hash: Field; value: A }
  | { kind: 'node'; hash: Field; left: BinTree<A>; right: BinTree<A> };

function treeOfArray<A>(
  depth: number,
  hashElement: (a: A) => Field,
  xs: A[]
): BinTree<A> {
  if (xs.length === 0) {
    return emptyTree(depth);
  }
  if (xs.length > 1 << depth) {
    throw new Error(
      `Length of elements (${xs.length}) is greater than 2^depth = ${
        1 << depth
      }`
    );
  }

  let trees: BinTree<A>[] = xs.map((x) => ({
    kind: 'leaf',
    hash: hashElement(x),
    value: x,
  }));
  for (let treesDepth = 0; treesDepth < depth; ++treesDepth) {
    const newTrees: BinTree<A>[] = [];
    for (let j = 0; j < trees.length >> 1; ++j) {
      const left = trees[2 * j];
      const right = trees[2 * j + 1] || emptyTree(treesDepth);
      newTrees.push({
        kind: 'node',
        hash: Poseidon.hash([left.hash, right.hash]),
        left,
        right,
      });
    }
    trees = newTrees;
  }

  console.assert(trees.length === 1);
  return trees[0];
}

function impliedRoot(
  index: Array<Bool>,
  path: Array<Field>,
  leaf: Field
): Field {
  let impliedRoot = leaf;
  for (let i = 0; i < index.length; ++i) {
    let [left, right] = Circuit.if(
      index[i],
      [path[i], impliedRoot],
      [impliedRoot, path[i]]
    );
    impliedRoot = Poseidon.hash([left, right]);
  }
  return impliedRoot;
}

function checkMerklePath(
  root: Field,
  index: Array<Bool>,
  path: Array<Field>,
  leaf: Field
) {
  root.assertEquals(impliedRoot(index, path, leaf));
}

function emptyTree<A>(depth: number): BinTree<A> {
  return { kind: 'empty', depth, hash: emptyHash(depth) };
}

export class Tree<A> {
  value: BinTree<A>;

  constructor(depth: number, hashElement: (a: A) => Field, values: Array<A>) {
    this.value = treeOfArray(depth, hashElement, values);
  }

  root(): Field {
    return this.value.hash;
  }

  setValue(index: Array<boolean>, x: A, eltHash: Field) {
    let stack = [];
    let tree = this.value;

    for (let i = index.length - 1; i >= 0; --i) {
      stack.push(tree);
      switch (tree.kind) {
        case 'leaf':
          throw new Error('Tree/index depth mismatch');
        case 'empty':
          (tree as any).kind = 'node';
          (tree as any).left = emptyTree(tree.depth - 1);
          (tree as any).right = emptyTree(tree.depth - 1);
          delete (tree as any).depth;
          tree = index[i] ? (tree as any).right : (tree as any).left;
          break;
        case 'node':
          tree = index[i] ? tree.right : tree.left;
          break;
        default:
          throw 'unreachable';
      }
    }

    switch (tree.kind) {
      case 'empty':
        (tree as any).kind = 'leaf';
        (tree as any).value = x;
        delete (tree as any).depth;
        tree.hash = eltHash;
        break;

      case 'leaf':
        tree.hash = eltHash;
        tree.value = x;
        break;

      default:
        break;
    }

    for (let i = stack.length - 1; i >= 0; --i) {
      tree = stack[i];

      if (tree.kind !== 'node') {
        throw 'unreachable';
      }
      tree.hash = Poseidon.hash([tree.left.hash, tree.right.hash]);
    }
  }

  get(index: Array<boolean>): { value: A | null; hash: Field } {
    let tree = this.value;
    let i = index.length - 1;

    for (let i = index.length - 1; i >= 0; --i) {
      switch (tree.kind) {
        case 'empty':
          return { value: null, hash: tree.hash };

        case 'leaf':
          return tree;

        case 'node':
          tree = index[i] ? tree.right : tree.left;
          break;

        default:
          break;
      }
    }

    throw new Error('Malformed merkle tree');
  }

  getValue(index: Array<boolean>): A | null {
    return this.get(index).value;
  }

  getElementHash(index: Array<boolean>): Field {
    return this.get(index).hash;
  }

  getMerklePath(index: Array<boolean>): Array<Field> {
    let res = [];
    let tree = this.value;

    let keepGoing = true;

    let i = index.length - 1;
    for (let i = index.length - 1; i >= 0; --i) {
      switch (tree.kind) {
        case 'empty':
          res.push(emptyHash(i));
          break;

        case 'node':
          res.push(index[i] ? tree.left.hash : tree.right.hash);
          tree = index[i] ? tree.right : tree.left;
          break;

        case 'leaf':
          throw new Error('Index/tree length mismatch.');
        default:
          throw 'unreachable';
      }
    }

    res.reverse();

    return res;
 }
}

export interface MerkleTree<A> {
  setValue: (index: Array<boolean>, x: A, eltHash: Field) => void;
  getValue: (index: Array<boolean>) => A | null;
  getElementHash: (index: Array<boolean>) => Field;
  getMerklePath: (index: Array<boolean>) => Array<Field>;
  root: () => Field;
}

function constantIndex(xs: Array<Bool>): Array<boolean> {
  console.log('constantindex');
  return xs.map((b) => b.toBoolean());
}

export class Collection<A> {
  eltTyp: AsFieldElements<A>;
  values:
    | { computed: true; value: MerkleTree<A> }
    | { computed: false; f: () => MerkleTree<A> };

  // Maintains a set of currently valid path witnesses.
  // If the root changes, witnesses will be invalidated.
  cachedPaths: Map<IndexId, Array<Field>>;
  cachedValues: Map<IndexId, { value: A; hash: Field }>;
  root: Field | null;

  getRoot(): Field {
    if (this.root === null) {
      this.root = this.getValues().root();
    }
    return this.root;
  }

  constructor(eltTyp: AsFieldElements<A>, f: () => Tree<A>, root?: Field) {
    this.eltTyp = eltTyp;
    this.cachedPaths = new Map();
    this.cachedValues = new Map();
    this.values = { computed: false, f };
    this.root = null;
  }

  private getValues(): MerkleTree<A> {
    if (this.values.computed) {
      return this.values.value;
    } else {
      let value = this.values.f();
      this.values = { computed: true, value };
      return value;
    }
  }

  set(i: Index, x: A) {
    let cachedPath = this.cachedPaths.get(i.id);

    let path: Array<Field>;
    if (cachedPath !== undefined) {
      path = cachedPath;
    } else {
      let depth = i.value.length;
      let typ = Circuit.array(Field, depth);

      let oldEltHash = Circuit.witness(Field, () =>
        this.getValues().getElementHash(constantIndex(i.value))
      );

      path = Circuit.witness(typ, () => {
        return this.getValues().getMerklePath(constantIndex(i.value));
      });

      checkMerklePath(this.getRoot(), i.value, path, oldEltHash);
    }

    let eltHash = Poseidon.hash(this.eltTyp.toFieldElements(x));

    // Must clear the caches as we don't know if other indices happened to be equal to this one.
    this.cachedPaths.clear();
    this.cachedValues.clear();

    this.cachedPaths.set(i.id, path);
    this.cachedValues.set(i.id, { value: x, hash: eltHash });

    let newRoot = impliedRoot(i.value, path, eltHash);
    Circuit.asProver(() => {
      this.getValues().setValue(
        constantIndex(i.value),
        x,
        eltHash.toConstant()
      );
    });

    this.root = newRoot;
  }

  get(i: Index): A {
    let cached = this.cachedValues.get(i.id);
    if (cached !== undefined) {
      return cached.value;
    }

    let depth = i.value.length;
    let typ = Circuit.array(Field, depth);

    let merkleProof: Array<Field> = Circuit.witness(typ, () => {
      return this.getValues().getMerklePath(constantIndex(i.value));
    });

    let res: A = Circuit.witness(this.eltTyp, () => {
      let res = this.getValues().getValue(constantIndex(i.value));
      if (res === null) {
        throw new Error('Index not present in collection');
      }
      return res;
    });

    let eltHash = Poseidon.hash(this.eltTyp.toFieldElements(res));
    this.cachedValues.set(i.id, { value: res, hash: eltHash });
    this.cachedPaths.set(i.id, merkleProof);

    checkMerklePath(this.getRoot(), i.value, merkleProof, eltHash);

    return res;
  }
}
