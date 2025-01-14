/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { expect } from 'chai';
import { FirebaseApp } from '@firebase/app-types';
import { StringFormat } from '../../src/implementation/string';
import { Headers } from '../../src/implementation/connection';
import { Metadata } from '../../src/metadata';
import {
  Reference,
  uploadString,
  uploadBytesResumable,
  deleteObject,
  list,
  getMetadata,
  updateMetadata,
  getDownloadURL,
  uploadBytes
} from '../../src/reference';
import { FirebaseStorageImpl, ref } from '../../src/service';
import * as testShared from './testshared';
import { SendHook, TestingConnection } from './connection';
import { DEFAULT_HOST } from '../../src/implementation/constants';
import { FirebaseAuthInternalName } from '@firebase/auth-interop-types';
import { Provider } from '@firebase/component';
import { AppCheckInternalComponentName } from '@firebase/app-check-interop-types';
import { fakeServerHandler, storageServiceWithHandler } from './testshared';
import { decodeUint8Array } from '../../src/platform/base64';

/* eslint-disable @typescript-eslint/no-floating-promises */
function makeFakeService(
  app: FirebaseApp,
  authProvider: Provider<FirebaseAuthInternalName>,
  appCheckProvider: Provider<AppCheckInternalComponentName>,
  sendHook: SendHook
): FirebaseStorageImpl {
  return new FirebaseStorageImpl(
    app,
    authProvider,
    appCheckProvider,
    testShared.makePool(sendHook)
  );
}

function makeStorage(url: string): Reference {
  const service = new FirebaseStorageImpl(
    {} as FirebaseApp,
    testShared.emptyAuthProvider,
    testShared.fakeAppCheckTokenProvider,
    testShared.makePool(null)
  );
  return new Reference(service, url);
}

function withFakeSend(
  testFn: (text: string, headers?: Headers) => void,
  resolveFn: () => void
): Reference {
  function newSend(
    connection: TestingConnection,
    url: string,
    method: string,
    body?: ArrayBufferView | Blob | string | null,
    headers?: Headers
  ): void {
    let text: Promise<string>;
    if (body instanceof Uint8Array) {
      text = Promise.resolve(decodeUint8Array(body));
    } else {
      text = (body as Blob).text();
    }
    text.then(text => {
      testFn(text, headers);
      connection.abort();
      resolveFn();
    });
  }
  const service = makeFakeService(
    testShared.fakeApp,
    testShared.fakeAuthProvider,
    testShared.fakeAppCheckTokenProvider,
    newSend
  );
  return ref(service, 'gs://test-bucket');
}

describe('Firebase Storage > Reference', () => {
  const root = makeStorage('gs://test-bucket/');
  const child = makeStorage('gs://test-bucket/hello');
  describe('Path constructor', () => {
    it('root', () => {
      expect(root.toString()).to.equal('gs://test-bucket/');
    });
    it('keeps characters after ? on a gs:// string', () => {
      const s = makeStorage('gs://test-bucket/this/ismyobject?hello');
      expect(s.toString()).to.equal('gs://test-bucket/this/ismyobject?hello');
    });
    it("doesn't URL-decode on a gs:// string", () => {
      const s = makeStorage('gs://test-bucket/%3F');
      expect(s.toString()).to.equal('gs://test-bucket/%3F');
    });
    it('ignores URL params and fragments on an http URL', () => {
      const s = makeStorage(
        `http://${DEFAULT_HOST}/v0/b/test-bucket/o/my/object.txt` +
          '?ignoreme#please'
      );
      expect(s.toString()).to.equal('gs://test-bucket/my/object.txt');
    });
    it('URL-decodes and ignores fragment on an http URL', () => {
      const s = makeStorage(
        `http://${DEFAULT_HOST}/v0/b/test-bucket/o/%3F?ignore`
      );
      expect(s.toString()).to.equal('gs://test-bucket/?');
    });

    it('ignores URL params and fragments on an https URL', () => {
      const s = makeStorage(
        `https://${DEFAULT_HOST}/v0/b/test-bucket/o/my/object.txt` +
          '?ignoreme#please'
      );
      expect(s.toString()).to.equal('gs://test-bucket/my/object.txt');
    });

    it('URL-decodes and ignores fragment on an https URL', () => {
      const s = makeStorage(
        `https://${DEFAULT_HOST}/v0/b/test-bucket/o/%3F?ignore`
      );
      expect(s.toString()).to.equal('gs://test-bucket/?');
    });
  });

  describe('toString', () => {
    it("Doesn't add trailing slash", () => {
      const s = makeStorage('gs://test-bucket/foo');
      expect(s.toString()).to.equal('gs://test-bucket/foo');
    });
    it('Strips trailing slash', () => {
      const s = makeStorage('gs://test-bucket/foo/');
      expect(s.toString()).to.equal('gs://test-bucket/foo');
    });
  });

  describe('parentReference', () => {
    it('Returns null at root', () => {
      expect(root.parent).to.be.null;
    });
    it('Returns root one level down', () => {
      expect(child.parent!.toString()).to.equal('gs://test-bucket/');
    });
    it('Works correctly with empty levels', () => {
      const s = makeStorage('gs://test-bucket/a///');
      expect(s.parent!.toString()).to.equal('gs://test-bucket/a/');
    });
  });

  describe('root', () => {
    it('Returns self at root', () => {
      expect(root.root.toString()).to.equal('gs://test-bucket/');
    });

    it('Returns root multiple levels down', () => {
      const s = makeStorage('gs://test-bucket/a/b/c/d');
      expect(s.root.toString()).to.equal('gs://test-bucket/');
    });
  });

  describe('bucket', () => {
    it('Returns bucket name', () => {
      expect(root.bucket).to.equal('test-bucket');
    });
  });

  describe('fullPath', () => {
    it('Returns full path without leading slash', () => {
      const s = makeStorage('gs://test-bucket/full/path');
      expect(s.fullPath).to.equal('full/path');
    });
  });

  describe('name', () => {
    it('Works at top level', () => {
      const s = makeStorage('gs://test-bucket/toplevel.txt');
      expect(s.name).to.equal('toplevel.txt');
    });

    it('Works at not the top level', () => {
      const s = makeStorage('gs://test-bucket/not/toplevel.txt');
      expect(s.name).to.equal('toplevel.txt');
    });
  });

  describe('get child with ref()', () => {
    it('works with a simple string', () => {
      expect(ref(root, 'a').toString()).to.equal('gs://test-bucket/a');
    });
    it('drops a trailing slash', () => {
      expect(ref(root, 'ab/').toString()).to.equal('gs://test-bucket/ab');
    });
    it('compresses repeated slashes', () => {
      expect(ref(root, '//a///b/////').toString()).to.equal(
        'gs://test-bucket/a/b'
      );
    });
    it('works chained multiple times with leading slashes', () => {
      expect(
        ref(ref(ref(ref(root, 'a'), '/b'), 'c'), 'd/e').toString()
      ).to.equal('gs://test-bucket/a/b/c/d/e');
    });
  });

  it("Doesn't send Authorization on null auth token", done => {
    function newSend(
      connection: TestingConnection,
      url: string,
      method: string,
      body?: ArrayBufferView | Blob | string | null,
      headers?: Headers
    ): void {
      expect(headers).to.not.be.undefined;
      expect(headers!['Authorization']).to.be.undefined;
      done();
    }

    const service = makeFakeService(
      testShared.fakeApp,
      testShared.emptyAuthProvider,
      testShared.fakeAppCheckTokenProvider,
      newSend
    );
    const reference = ref(service, 'gs://test-bucket');
    getMetadata(ref(reference, 'foo'));
  });

  it('Works if the user logs in before creating the storage reference', done => {
    // Regression test for b/27227221
    function newSend(
      connection: TestingConnection,
      url: string,
      method: string,
      body?: ArrayBufferView | Blob | string | null,
      headers?: Headers
    ): void {
      expect(headers).to.not.be.undefined;
      expect(headers!['Authorization']).to.equal(
        'Firebase ' + testShared.authToken
      );
      done();
    }

    const service = makeFakeService(
      testShared.fakeApp,
      testShared.fakeAuthProvider,
      testShared.fakeAppCheckTokenProvider,
      newSend
    );
    const reference = ref(service, 'gs://test-bucket');
    getMetadata(ref(reference, 'foo'));
  });

  describe('uploadString', () => {
    it('Uses metadata.contentType for RAW format', done => {
      // Regression test for b/30989476
      const root = withFakeSend((text: string, headers?: Headers) => {
        expect(text).to.include('"contentType":"lol/wut"');
      }, done);
      uploadString(ref(root, 'test'), 'hello', StringFormat.RAW, {
        contentType: 'lol/wut'
      } as Metadata);
    });
    it('Uses embedded content type in DATA_URL format', done => {
      const root = withFakeSend((text: string) => {
        expect(text).to.include('"contentType":"lol/wat"');
      }, done);
      uploadString(
        ref(root, 'test'),
        'data:lol/wat;base64,aaaa',
        StringFormat.DATA_URL
      );
    });
    it('Lets metadata.contentType override embedded content type in DATA_URL format', done => {
      const root = withFakeSend((text: string) => {
        expect(text).to.include('"contentType":"tomato/soup"');
      }, done);
      uploadString(
        ref(root, 'test'),
        'data:ignore/me;base64,aaaa',
        StringFormat.DATA_URL,
        { contentType: 'tomato/soup' } as Metadata
      );
    });
  });

  describe('uploadBytes', () => {
    it('Uses metadata.contentType', done => {
      const root = withFakeSend((text: string) => {
        expect(text).to.include('"contentType":"lol/wut"');
      }, done);
      uploadBytes(ref(root, 'hello'), new Uint8Array(), {
        contentType: 'lol/wut'
      } as Metadata);
    });
    it('uploads without error', async () => {
      const storageService = storageServiceWithHandler(fakeServerHandler({}));
      const root = ref(storageService, 'gs://test-bucket/');
      const childRef = ref(root, 'child');
      const blob = new Uint8Array([97]);
      const result = await uploadBytes(childRef, blob);
      expect(result.ref).to.equal(childRef);
    });
  });

  describe('Argument verification', () => {
    describe('list', () => {
      it('throws on invalid maxResults', async () => {
        await expect(list(child, { maxResults: 0 })).to.be.rejectedWith(
          'storage/invalid-argument'
        );
        await expect(list(child, { maxResults: -4 })).to.be.rejectedWith(
          'storage/invalid-argument'
        );
        await expect(list(child, { maxResults: 1001 })).to.be.rejectedWith(
          'storage/invalid-argument'
        );
      });
    });
  });

  describe('root operations', () => {
    it('uploadBytesResumable throws', () => {
      expect(() => uploadBytesResumable(root, new Uint8Array())).to.throw(
        'storage/invalid-root-operation'
      );
    });
    it('uploadString throws', () => {
      expect(() => uploadString(root, 'raw', StringFormat.RAW)).to.throw(
        'storage/invalid-root-operation'
      );
    });
    it('uploadBytes throws', () => {
      expect(() => uploadBytes(root, new Uint8Array())).to.throw(
        'storage/invalid-root-operation'
      );
    });
    it('deleteObject throws', async () => {
      await expect(deleteObject(root)).to.be.rejectedWith(
        'storage/invalid-root-operation'
      );
    });
    it('getMetadata throws', async () => {
      await expect(getMetadata(root)).to.be.rejectedWith(
        'storage/invalid-root-operation'
      );
    });
    it('updateMetadata throws', async () => {
      await expect(updateMetadata(root, {} as Metadata)).to.be.rejectedWith(
        'storage/invalid-root-operation'
      );
    });
    it('getDownloadURL throws', async () => {
      await expect(getDownloadURL(root)).to.be.rejectedWith(
        'storage/invalid-root-operation'
      );
    });
  });
});
