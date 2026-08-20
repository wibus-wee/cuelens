import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDeferredEffectLifetime } from '../src/react-lifecycle.ts';

describe('React-owned runtime lifetime', () => {
  it('survives a StrictMode effect replay and disposes after a real unmount', () => {
    const deferred = [];
    let disposals = 0;
    const lifetime = createDeferredEffectLifetime(
      () => {
        disposals += 1;
      },
      (callback) => deferred.push(callback)
    );

    const releaseProbe = lifetime.acquire();
    releaseProbe();
    const releaseMounted = lifetime.acquire();
    deferred.shift()();
    assert.equal(disposals, 0);

    releaseMounted();
    deferred.shift()();
    assert.equal(disposals, 1);
  });
});
