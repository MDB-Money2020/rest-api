var fs = require('fs');
var AWS = require('aws-sdk');
var uuid = require('uuid/v4');
var user = require('../logic/user.js');
var apicaller = require("./apicaller.js");
AWS.config.region = 'us-east-1';
var rekognition = new AWS.Rekognition();
var db = new AWS.DynamoDB();
var s3 = new AWS.S3();

function get_face(params) {
  return new Promise(function(resolve, reject) {
    rekognition.searchFacesByImage(params, function(err, data) {
      if (err) {
        reject(err);
      } else if (!data || !data.FaceMatches ||
        data.FaceMatches.length == 0 ||
        !data.FaceMatches[0].Face || !data.FaceMatches[0].Face.FaceId
      ) {
        reject(new Error("bad face data"));
      } else {
        resolve(data.FaceMatches[0].Face.FaceId);
      }
    });
  });
}

function get_item_and_store(params, encodedUrl, fileExt) {
  return new Promise(function(resolve, reject) {
    db.getItem(params, function(err, data) {
      if (err) {
        reject(err);
      } else if (!data || !data.Item || !data.Item.FullName || !data.Item
        .Id) {
        reject(new Error("bad item data"));
      } else {
        var fullName;
        var id;
        try {
          fullName = data.Item.FullName.S;
          id = data.Item.Id.S;
        } catch(e) {
          reject(new Error("bad item data!"));
          return;
        }
        storeImageInS3(encodedUrl, fullName, id, fileExt).then(function() {
          resolve(id);
        }).catch(function(error) {
          reject(error);
        });
      }
    });
  });
}

function storeImageInS3(img, name, id, fileExt) {
  var params = {
    Bucket: 'instantfaces',
    Key: 'index/' + uuid() + '.' + fileExt,
    Body: img,
    Metadata: {
      "FullName": name,
      "Id": id
    }
  };
  return new Promise(function(resolve, reject) {
    s3.putObject(params, function(err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

function process_image(url) {
  var encoded;
  var fileExt = url.split('.').pop();
  return apicaller.get(url).then(function(data) {
    encoded = data;
    var params = {
      CollectionId: "the_collection",
      FaceMatchThreshold: 90,
      Image: {
        Bytes: encoded
      },
      MaxFaces: 1
    };
    return get_face(params);
  }).then(function(faceId) {
    var params = {
      AttributesToGet: [
        "FullName",
        "Id"
      ],
      TableName: 'new_collection',
      Key: {
        "RekognitionId": {
          "S": faceId
        }
      }
    }
    return get_item_and_store(params, encoded, fileExt);
  }).then(function(userId) {
    return user.getById({
      userId: userId
    });
  });

}

module.exports.process_image = process_image;
