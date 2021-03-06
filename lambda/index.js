'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');
const path = require('path');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
const ALLOWED_DIMENSIONS = new Set();
const EXTENSIONS = {
  '.jpg': {
    format: 'jpeg',
    contentType: 'image/jpeg'
  },
  '.webp': {
    format: 'webp',
    contentType: 'image/webp'
  }
}

if (process.env.ALLOWED_DIMENSIONS) {
  const dimensions = process.env.ALLOWED_DIMENSIONS.split(/\s*,\s*/);
  dimensions.forEach((dimension) => ALLOWED_DIMENSIONS.add(dimension));
}

exports.handler = function(event, _context, callback) {
  const key = decodeURIComponent(event.queryStringParameters.key);
  const match = key.match(/((\d+)x(\d+))\/(.*)/);
  const dimensions = match[1];
  const width = parseInt(match[2], 10);
  const height = parseInt(match[3], 10);
  const originalKey = match[4];
  const basename = path.basename(originalKey);
  const extension = path.extname(originalKey);
  console.log(basename)

  if ((ALLOWED_DIMENSIONS.size > 0 && !ALLOWED_DIMENSIONS.has(dimensions)) || typeof EXTENSIONS[extension] === 'undefined') {
     callback(null, {
      statusCode: '403',
      headers: {},
      body: '',
    });
    return;
  }

  let redirectToKeyLocation = () => callback(null, {
    statusCode: '301',
    headers: {'location': `${URL}/${key}`},
    body: '',
  });
  
  S3.headObject({Bucket: BUCKET, Key: key}).promise()
  .then(_data => redirectToKeyLocation())
  .catch(err => {
    if (err && err.code == 'Forbidden') {
      S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
        .then(data => Sharp(data.Body)
          .resize(width, height, { fit: Sharp.fit.inside })
          .toFormat(EXTENSIONS[extension].format)
          .toBuffer()
        )
        .then(buffer => S3.putObject({
          Body: buffer,
          Bucket: BUCKET,
          ContentType: EXTENSIONS[extension].contentType,
          Key: key,
        }).promise()
        .then(() => redirectToKeyLocation())
        .catch(err => callback(err))
      )
    }
  })
  .catch(err => callback(err))
}