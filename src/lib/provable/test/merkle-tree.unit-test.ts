import { Bool, Field } from '../wrapped.js';
import { MerkleTree, conditionalSwap } from '../merkle-tree.js';
import { Random, test } from '../../testing/property.js';
import { expect } from 'expect';
import { MerkleMap, MerkleMapWitness } from '../merkle-map.js';
import { IndexedMerkleMap, Leaf } from '../merkle-tree-indexed.js';
import { synchronousRunners } from '../core/provable-context.js';
import { Provable } from '../provable.js';
import { constraintSystem } from '../../testing/constraint-system.js';
import { field } from '../../testing/equivalent.js';
import { throwError } from './test-utils.js';

const height = 31;
const IndexedMap30 = IndexedMerkleMap(height);
const indexedMap = new IndexedMap30();

// compare constraints used by indexed merkle map (with 1B leaves) vs sparse merkle map

console.log(
  'indexed merkle map (get)',
  constraintSystem.size({ from: [field] }, (key) => {
    indexedMap.get(key);
  })
);
console.log(
  'indexed merkle map (get option)',
  constraintSystem.size({ from: [field] }, (key) => {
    indexedMap.getOption(key);
  })
);

console.log(
  'sparse merkle map (get)',
  constraintSystem.size(
    { from: [field, field, field, field] },
    (root, key, value) => {
      let mapWitness = Provable.witness(MerkleMapWitness, () =>
        throwError('unused')
      );
      let [actualRoot, actualKey] = mapWitness.computeRootAndKey(value);
      key.assertEquals(actualKey);
      root.assertEquals(actualRoot);
    }
  )
);

console.log(
  '\nindexed merkle map (insert)',
  constraintSystem.size({ from: [field, field] }, (key, value) => {
    indexedMap.insert(key, value);
  })
);
console.log(
  'indexed merkle map (update)',
  constraintSystem.size({ from: [field, field] }, (key, value) => {
    indexedMap.update(key, value);
  })
);
console.log(
  'indexed merkle map (set)',
  constraintSystem.size({ from: [field, field] }, (key, value) => {
    indexedMap.set(key, value);
  })
);

console.log(
  'sparse merkle map (set)',
  constraintSystem.size(
    { from: [field, field, field, field] },
    (root, key, oldValue, value) => {
      let mapWitness = Provable.witness(MerkleMapWitness, () =>
        throwError('unused')
      );
      let [actualRoot, actualKey] = mapWitness.computeRootAndKey(oldValue);
      key.assertEquals(actualKey);
      root.assertEquals(actualRoot);

      let [_newRoot] = mapWitness.computeRootAndKey(value);
    }
  )
);

console.log(
  '\nindexed merkle map (assert included)',
  constraintSystem.size({ from: [field] }, (key) => {
    indexedMap.assertIncluded(key);
  })
);
console.log(
  'indexed merkle map (assert not included)',
  constraintSystem.size({ from: [field] }, (key) => {
    indexedMap.assertNotIncluded(key);
  })
);
console.log(
  'indexed merkle map (is included)',
  constraintSystem.size({ from: [field] }, (key) => {
    indexedMap.isIncluded(key);
  })
);

// some manual tests for IndexedMerkleMap
{
  let map = new (IndexedMerkleMap(3))();

  // there's 1 element in the map at the beginning
  // check initial root against `MerkleTree` implementation
  expect(map.length.toBigInt()).toEqual(1n);
  let initialTree = new MerkleTree(3);
  initialTree.setLeaf(0n, Leaf.hashNode(IndexedMerkleMap(3)._firstLeaf));
  expect(map.root).toEqual(initialTree.getRoot());

  map.insert(2n, 14n);
  map.insert(1n, 13n);

  // -1 (the max value) can't be inserted, because there's always a value pointing to it,
  // and yet it's not included as a leaf
  expect(() => map.insert(-1n, 11n)).toThrow('Key already exists');
  expect(() => map.set(-1n, 12n)).toThrow('Invalid leaf');

  expect(map.getOption(1n).assertSome().toBigInt()).toEqual(13n);
  expect(map.getOption(2n).assertSome().toBigInt()).toEqual(14n);
  expect(map.getOption(3n).isSome.toBoolean()).toEqual(false);

  map.update(2n, 15n);
  map.update(0n, 12n);
  expect(map.getOption(2n).assertSome().toBigInt()).toEqual(15n);

  // TODO get() doesn't work on 0n because the low node checks fail
  // expect(map.get(0n).assertSome().toBigInt()).toEqual(12n);

  // can't insert the same key twice
  expect(() => map.insert(1n, 17n)).toThrow('Key already exists');

  // can't update a non-existent key
  expect(() => map.update(3n, 16n)).toThrow('Key does not exist');

  map.set(4n, 16n);
  map.set(1n, 17n);
  expect(map.get(4n).toBigInt()).toEqual(16n);
  expect(map.getOption(1n).assertSome().toBigInt()).toEqual(17n);
  expect(map.getOption(5n).isSome.toBoolean()).toEqual(false);

  // can't insert more than 2^(height - 1) = 2^2 = 4 keys
  expect(() => map.insert(8n, 19n)).toThrow('4 does not fit in 2 bits');
  expect(() => map.set(8n, 19n)).toThrow('4 does not fit in 2 bits');

  // check that length is as expected
  expect(map.length.toBigInt()).toEqual(4n);

  // check that internal nodes exactly match `MerkleTree` implementation
  let keys = [0n, 2n, 1n, 4n]; // insertion order
  let leafNodes = keys.map((key) => Leaf.hashNode(map._findLeaf(key).self));
  let tree = new MerkleTree(3);
  tree.fill(leafNodes);
  let nodes = map.data.get().nodes;

  for (let level = 0; level < 3; level++) {
    for (let i = 0; i < 2 ** (2 - level); i++) {
      expect(nodes[level][i]).toEqual(tree.nodes[level][i].toBigInt());
    }
  }

  // check that internal `sortedLeaves` are as expected

  // data sorted by key:
  let sorted = [
    { key: 0n, value: 12n, index: 0n },
    { key: 1n, value: 17n, index: 2n },
    { key: 2n, value: 15n, index: 1n },
    { key: 4n, value: 16n, index: 3n },
  ];
  let sortedLeaves = map.data.get().sortedLeaves;

  for (let i = 0; i < 4; i++) {
    expect(sortedLeaves[i]).toEqual({
      key: sorted[i].key,
      value: sorted[i].value,
      nextKey: sorted[i + 1]?.key ?? Field.ORDER - 1n,
      index: sorted[i].index,
    });
  }
}

// property tests for indexed merkle map

let uniformField = Random.map(Random(Field.random), (x) => x.toBigInt());
let { runAndCheckSync } = await synchronousRunners();

let n = 5;

test(
  Random.array(uniformField, n),
  Random.array(uniformField, n),
  Random.array(Random.field, n),
  Random.array(Random.field, n),
  Random.int(6, 40),
  Random.int(0, n - 1),
  (initialKeys, keys, initialValues, values, height, i0) => {
    class MerkleMap extends IndexedMerkleMap(height) {}

    // fill a merkle map with the initial keys and values outside provable code
    let map = new MerkleMap();
    for (let i = 0; i < n; i++) {
      map.insert(initialKeys[i], initialValues[i]);
    }

    const witness = (x: Field | bigint) => Provable.witness(Field, () => x);

    // pass the map to a circuit
    runAndCheckSync(() => {
      map = Provable.witness(MerkleMap.provable, () => map);
      let initialKeysF = initialKeys.map(witness);
      let keysF = keys.map(witness);
      let valuesF = values.map(witness);

      for (let i = 0; i < n; i++) {
        // confirm we still have the same keys and values
        map
          .getOption(initialKeysF[i])
          .assertSome()
          .assertEquals(initialValues[i]);

        // new keys are not in the map
        map.getOption(keysF[i]).isSome.assertFalse();
      }

      // can't update a non-existent key
      expect(() => map.update(keysF[i0], valuesF[i0])).toThrow(
        'Key does not exist'
      );

      // set initial values at new keys, and values at initial keys
      for (let i = 0; i < n; i++) {
        map.set(keysF[i], initialValues[i]);
        map.set(initialKeysF[i], valuesF[i]);
      }

      // check that the updated keys and values are in the map
      for (let i = 0; i < n; i++) {
        map.getOption(keysF[i]).assertSome().assertEquals(initialValues[i]);
        map.get(initialKeysF[i]).assertEquals(valuesF[i]);
      }

      // update the new keys with the new values
      for (let i = 0; i < n; i++) {
        map.update(keys[i], valuesF[i]);
      }

      // move the map back to constants
      Provable.asProver(() => {
        map = Provable.toConstant(MerkleMap.provable, map);
      });
    });

    // check that the map is still the same
    for (let i = 0; i < n; i++) {
      expect(map.getOption(keys[i]).assertSome()).toEqual(Field(values[i]));
      expect(map.getOption(initialKeys[i]).assertSome()).toEqual(
        Field(values[i])
      );
    }
    // random element is not in the map
    expect(map.getOption(Field.random()).isSome).toEqual(Bool(false));
    // length is as expected
    expect(map.length).toEqual(Field(2 * n + 1));

    // creating a new map with the same key-value pairs, where keys are inserted in the same order, gives the same root
    let map2 = new MerkleMap();
    for (let i = 0; i < n; i++) {
      map2.insert(initialKeys[i], values[i]);
    }
    for (let i = 0; i < n; i++) {
      map2.insert(keys[i], values[i]);
    }
    expect(map.root).toEqual(map2.root);
  }
);

// property tests for conditional swap

test(Random.bool, Random.field, Random.field, (b, x, y) => {
  let [x0, y0] = conditionalSwap(Bool(!!b), Field(x), Field(y));

  // if the boolean is true, it shouldn't swap the fields; otherwise, it should
  if (b) {
    expect(x0.toBigInt()).toEqual(x);
    expect(y0.toBigInt()).toEqual(y);
  } else {
    expect(x0.toBigInt()).toEqual(y);
    expect(y0.toBigInt()).toEqual(x);
  }
});

// property tests for merkle map

test(Random.field, (key) => {
  let map = new MerkleMap();
  let witness = map.getWitness(Field(key));
  let [, calculatedKey] = witness.computeRootAndKey(Field(0));
  expect(calculatedKey.toBigInt()).toEqual(key);
});
