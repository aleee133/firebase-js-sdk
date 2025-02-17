/**
 * @license
 * Copyright 2017 Google LLC
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

/**
 * @fileoverview Defines methods for interacting with the network.
 */

import { Metadata } from '../metadata';
import { ListResult } from '../list';
import { FbsBlob } from './blob';
import {
  StorageError,
  cannotSliceBlob,
  unauthenticated,
  quotaExceeded,
  unauthorized,
  objectNotFound,
  serverFileWrongSize,
  unknown,
  unauthorizedApp
} from './error';
import { Location } from './location';
import {
  Mappings,
  fromResourceString,
  downloadUrlFromResourceString,
  toResourceString
} from './metadata';
import { fromResponseString } from './list';
import { RequestInfo, UrlParams } from './requestinfo';
import { isString } from './type';
import { makeUrl } from './url';
import { Connection } from './connection';
import { FirebaseStorageImpl } from '../service';

/**
 * Throws the UNKNOWN StorageError if cndn is false.
 */
export function handlerCheck(cndn: boolean): void {
  if (!cndn) {
    throw unknown();
  }
}

export function metadataHandler(
  service: FirebaseStorageImpl,
  mappings: Mappings
): (p1: Connection, p2: string) => Metadata {
  function handler(xhr: Connection, text: string): Metadata {
    const metadata = fromResourceString(service, text, mappings);
    handlerCheck(metadata !== null);
    return metadata as Metadata;
  }
  return handler;
}

export function listHandler(
  service: FirebaseStorageImpl,
  bucket: string
): (p1: Connection, p2: string) => ListResult {
  function handler(xhr: Connection, text: string): ListResult {
    const listResult = fromResponseString(service, bucket, text);
    handlerCheck(listResult !== null);
    return listResult as ListResult;
  }
  return handler;
}

export function downloadUrlHandler(
  service: FirebaseStorageImpl,
  mappings: Mappings
): (p1: Connection, p2: string) => string | null {
  function handler(xhr: Connection, text: string): string | null {
    const metadata = fromResourceString(service, text, mappings);
    handlerCheck(metadata !== null);
    return downloadUrlFromResourceString(
      metadata as Metadata,
      text,
      service.host,
      service._protocol
    );
  }
  return handler;
}

export function sharedErrorHandler(
  location: Location
): (p1: Connection, p2: StorageError) => StorageError {
  function errorHandler(xhr: Connection, err: StorageError): StorageError {
    let newErr;
    if (xhr.getStatus() === 401) {
      if (
        // This exact message string is the only consistent part of the
        // server's error response that identifies it as an App Check error.
        xhr.getResponseText().includes('Firebase App Check token is invalid')
      ) {
        newErr = unauthorizedApp();
      } else {
        newErr = unauthenticated();
      }
    } else {
      if (xhr.getStatus() === 402) {
        newErr = quotaExceeded(location.bucket);
      } else {
        if (xhr.getStatus() === 403) {
          newErr = unauthorized(location.path);
        } else {
          newErr = err;
        }
      }
    }
    newErr.serverResponse = err.serverResponse;
    return newErr;
  }
  return errorHandler;
}

export function objectErrorHandler(
  location: Location
): (p1: Connection, p2: StorageError) => StorageError {
  const shared = sharedErrorHandler(location);

  function errorHandler(xhr: Connection, err: StorageError): StorageError {
    let newErr = shared(xhr, err);
    if (xhr.getStatus() === 404) {
      newErr = objectNotFound(location.path);
    }
    newErr.serverResponse = err.serverResponse;
    return newErr;
  }
  return errorHandler;
}

export function getMetadata(
  service: FirebaseStorageImpl,
  location: Location,
  mappings: Mappings
): RequestInfo<Metadata> {
  const urlPart = location.fullServerUrl();
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'GET';
  const timeout = service.maxOperationRetryTime;
  const requestInfo = new RequestInfo(
    url,
    method,
    metadataHandler(service, mappings),
    timeout
  );
  requestInfo.errorHandler = objectErrorHandler(location);
  return requestInfo;
}

export function list(
  service: FirebaseStorageImpl,
  location: Location,
  delimiter?: string,
  pageToken?: string | null,
  maxResults?: number | null
): RequestInfo<ListResult> {
  const urlParams: UrlParams = {};
  if (location.isRoot) {
    urlParams['prefix'] = '';
  } else {
    urlParams['prefix'] = location.path + '/';
  }
  if (delimiter && delimiter.length > 0) {
    urlParams['delimiter'] = delimiter;
  }
  if (pageToken) {
    urlParams['pageToken'] = pageToken;
  }
  if (maxResults) {
    urlParams['maxResults'] = maxResults;
  }
  const urlPart = location.bucketOnlyServerUrl();
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'GET';
  const timeout = service.maxOperationRetryTime;
  const requestInfo = new RequestInfo(
    url,
    method,
    listHandler(service, location.bucket),
    timeout
  );
  requestInfo.urlParams = urlParams;
  requestInfo.errorHandler = sharedErrorHandler(location);
  return requestInfo;
}

export function getDownloadUrl(
  service: FirebaseStorageImpl,
  location: Location,
  mappings: Mappings
): RequestInfo<string | null> {
  const urlPart = location.fullServerUrl();
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'GET';
  const timeout = service.maxOperationRetryTime;
  const requestInfo = new RequestInfo(
    url,
    method,
    downloadUrlHandler(service, mappings),
    timeout
  );
  requestInfo.errorHandler = objectErrorHandler(location);
  return requestInfo;
}

export function updateMetadata(
  service: FirebaseStorageImpl,
  location: Location,
  metadata: Partial<Metadata>,
  mappings: Mappings
): RequestInfo<Metadata> {
  const urlPart = location.fullServerUrl();
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'PATCH';
  const body = toResourceString(metadata, mappings);
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  const timeout = service.maxOperationRetryTime;
  const requestInfo = new RequestInfo(
    url,
    method,
    metadataHandler(service, mappings),
    timeout
  );
  requestInfo.headers = headers;
  requestInfo.body = body;
  requestInfo.errorHandler = objectErrorHandler(location);
  return requestInfo;
}

export function deleteObject(
  service: FirebaseStorageImpl,
  location: Location
): RequestInfo<void> {
  const urlPart = location.fullServerUrl();
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'DELETE';
  const timeout = service.maxOperationRetryTime;

  function handler(_xhr: Connection, _text: string): void {}
  const requestInfo = new RequestInfo(url, method, handler, timeout);
  requestInfo.successCodes = [200, 204];
  requestInfo.errorHandler = objectErrorHandler(location);
  return requestInfo;
}

export function determineContentType_(
  metadata: Metadata | null,
  blob: FbsBlob | null
): string {
  return (
    (metadata && metadata['contentType']) ||
    (blob && blob.type()) ||
    'application/octet-stream'
  );
}

export function metadataForUpload_(
  location: Location,
  blob: FbsBlob,
  metadata?: Metadata | null
): Metadata {
  const metadataClone = Object.assign({}, metadata);
  metadataClone['fullPath'] = location.path;
  metadataClone['size'] = blob.size();
  if (!metadataClone['contentType']) {
    metadataClone['contentType'] = determineContentType_(null, blob);
  }
  return metadataClone;
}

/**
 * Prepare RequestInfo for uploads as Content-Type: multipart.
 */
export function multipartUpload(
  service: FirebaseStorageImpl,
  location: Location,
  mappings: Mappings,
  blob: FbsBlob,
  metadata?: Metadata | null
): RequestInfo<Metadata> {
  const urlPart = location.bucketOnlyServerUrl();
  const headers: { [prop: string]: string } = {
    'X-Goog-Upload-Protocol': 'multipart'
  };

  function genBoundary(): string {
    let str = '';
    for (let i = 0; i < 2; i++) {
      str = str + Math.random().toString().slice(2);
    }
    return str;
  }
  const boundary = genBoundary();
  headers['Content-Type'] = 'multipart/related; boundary=' + boundary;
  const metadata_ = metadataForUpload_(location, blob, metadata);
  const metadataString = toResourceString(metadata_, mappings);
  const preBlobPart =
    '--' +
    boundary +
    '\r\n' +
    'Content-Type: application/json; charset=utf-8\r\n\r\n' +
    metadataString +
    '\r\n--' +
    boundary +
    '\r\n' +
    'Content-Type: ' +
    metadata_['contentType'] +
    '\r\n\r\n';
  const postBlobPart = '\r\n--' + boundary + '--';
  const body = FbsBlob.getBlob(preBlobPart, blob, postBlobPart);
  if (body === null) {
    throw cannotSliceBlob();
  }
  const urlParams: UrlParams = { name: metadata_['fullPath']! };
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'POST';
  const timeout = service.maxUploadRetryTime;
  const requestInfo = new RequestInfo(
    url,
    method,
    metadataHandler(service, mappings),
    timeout
  );
  requestInfo.urlParams = urlParams;
  requestInfo.headers = headers;
  requestInfo.body = body.uploadData();
  requestInfo.errorHandler = sharedErrorHandler(location);
  return requestInfo;
}

/**
 * @param current The number of bytes that have been uploaded so far.
 * @param total The total number of bytes in the upload.
 * @param opt_finalized True if the server has finished the upload.
 * @param opt_metadata The upload metadata, should
 *     only be passed if opt_finalized is true.
 */
export class ResumableUploadStatus {
  finalized: boolean;
  metadata: Metadata | null;

  constructor(
    public current: number,
    public total: number,
    finalized?: boolean,
    metadata?: Metadata | null
  ) {
    this.finalized = !!finalized;
    this.metadata = metadata || null;
  }
}

export function checkResumeHeader_(
  xhr: Connection,
  allowed?: string[]
): string {
  let status: string | null = null;
  try {
    status = xhr.getResponseHeader('X-Goog-Upload-Status');
  } catch (e) {
    handlerCheck(false);
  }
  const allowedStatus = allowed || ['active'];
  handlerCheck(!!status && allowedStatus.indexOf(status) !== -1);
  return status as string;
}

export function createResumableUpload(
  service: FirebaseStorageImpl,
  location: Location,
  mappings: Mappings,
  blob: FbsBlob,
  metadata?: Metadata | null
): RequestInfo<string> {
  const urlPart = location.bucketOnlyServerUrl();
  const metadataForUpload = metadataForUpload_(location, blob, metadata);
  const urlParams: UrlParams = { name: metadataForUpload['fullPath']! };
  const url = makeUrl(urlPart, service.host, service._protocol);
  const method = 'POST';
  const headers = {
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': `${blob.size()}`,
    'X-Goog-Upload-Header-Content-Type': metadataForUpload['contentType']!,
    'Content-Type': 'application/json; charset=utf-8'
  };
  const body = toResourceString(metadataForUpload, mappings);
  const timeout = service.maxUploadRetryTime;

  function handler(xhr: Connection): string {
    checkResumeHeader_(xhr);
    let url;
    try {
      url = xhr.getResponseHeader('X-Goog-Upload-URL');
    } catch (e) {
      handlerCheck(false);
    }
    handlerCheck(isString(url));
    return url as string;
  }
  const requestInfo = new RequestInfo(url, method, handler, timeout);
  requestInfo.urlParams = urlParams;
  requestInfo.headers = headers;
  requestInfo.body = body;
  requestInfo.errorHandler = sharedErrorHandler(location);
  return requestInfo;
}

/**
 * @param url From a call to fbs.requests.createResumableUpload.
 */
export function getResumableUploadStatus(
  service: FirebaseStorageImpl,
  location: Location,
  url: string,
  blob: FbsBlob
): RequestInfo<ResumableUploadStatus> {
  const headers = { 'X-Goog-Upload-Command': 'query' };

  function handler(xhr: Connection): ResumableUploadStatus {
    const status = checkResumeHeader_(xhr, ['active', 'final']);
    let sizeString: string | null = null;
    try {
      sizeString = xhr.getResponseHeader('X-Goog-Upload-Size-Received');
    } catch (e) {
      handlerCheck(false);
    }

    if (!sizeString) {
      // null or empty string
      handlerCheck(false);
    }

    const size = Number(sizeString);
    handlerCheck(!isNaN(size));
    return new ResumableUploadStatus(size, blob.size(), status === 'final');
  }
  const method = 'POST';
  const timeout = service.maxUploadRetryTime;
  const requestInfo = new RequestInfo(url, method, handler, timeout);
  requestInfo.headers = headers;
  requestInfo.errorHandler = sharedErrorHandler(location);
  return requestInfo;
}

/**
 * Any uploads via the resumable upload API must transfer a number of bytes
 * that is a multiple of this number.
 */
export const RESUMABLE_UPLOAD_CHUNK_SIZE: number = 256 * 1024;

/**
 * @param url From a call to fbs.requests.createResumableUpload.
 * @param chunkSize Number of bytes to upload.
 * @param status The previous status.
 *     If not passed or null, we start from the beginning.
 * @throws fbs.Error If the upload is already complete, the passed in status
 *     has a final size inconsistent with the blob, or the blob cannot be sliced
 *     for upload.
 */
export function continueResumableUpload(
  location: Location,
  service: FirebaseStorageImpl,
  url: string,
  blob: FbsBlob,
  chunkSize: number,
  mappings: Mappings,
  status?: ResumableUploadStatus | null,
  progressCallback?: ((p1: number, p2: number) => void) | null
): RequestInfo<ResumableUploadStatus> {
  // TODO(andysoto): standardize on internal asserts
  // assert(!(opt_status && opt_status.finalized));
  const status_ = new ResumableUploadStatus(0, 0);
  if (status) {
    status_.current = status.current;
    status_.total = status.total;
  } else {
    status_.current = 0;
    status_.total = blob.size();
  }
  if (blob.size() !== status_.total) {
    throw serverFileWrongSize();
  }
  const bytesLeft = status_.total - status_.current;
  let bytesToUpload = bytesLeft;
  if (chunkSize > 0) {
    bytesToUpload = Math.min(bytesToUpload, chunkSize);
  }
  const startByte = status_.current;
  const endByte = startByte + bytesToUpload;
  const uploadCommand =
    bytesToUpload === bytesLeft ? 'upload, finalize' : 'upload';
  const headers = {
    'X-Goog-Upload-Command': uploadCommand,
    'X-Goog-Upload-Offset': `${status_.current}`
  };
  const body = blob.slice(startByte, endByte);
  if (body === null) {
    throw cannotSliceBlob();
  }

  function handler(xhr: Connection, text: string): ResumableUploadStatus {
    // TODO(andysoto): Verify the MD5 of each uploaded range:
    // the 'x-range-md5' header comes back with status code 308 responses.
    // We'll only be able to bail out though, because you can't re-upload a
    // range that you previously uploaded.
    const uploadStatus = checkResumeHeader_(xhr, ['active', 'final']);
    const newCurrent = status_.current + bytesToUpload;
    const size = blob.size();
    let metadata;
    if (uploadStatus === 'final') {
      metadata = metadataHandler(service, mappings)(xhr, text);
    } else {
      metadata = null;
    }
    return new ResumableUploadStatus(
      newCurrent,
      size,
      uploadStatus === 'final',
      metadata
    );
  }
  const method = 'POST';
  const timeout = service.maxUploadRetryTime;
  const requestInfo = new RequestInfo(url, method, handler, timeout);
  requestInfo.headers = headers;
  requestInfo.body = body.uploadData();
  requestInfo.progressCallback = progressCallback || null;
  requestInfo.errorHandler = sharedErrorHandler(location);
  return requestInfo;
}
