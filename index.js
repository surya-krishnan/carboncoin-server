var express = require("express")
var app = express()
const assert = require('assert');

const MongoClient = require('mongodb').MongoClient
const uri = "mongodb+srv://api:soorya@carboncoin-9pa4g.gcp.mongodb.net/test?retryWrites=true&w=majority"
const dbName = "CarbonCoinDev"
const client = new MongoClient(uri);

client.connect(function(err, client) {
  //assert.equal(null, err);
  console.log("Connected correctly to server");

  const db = client.db(dbName);
  findUsers(db, function() {
    client.close();
  });
});

function findUsers(db, callback) {
    const collec = db.collection('users')
    collec
        .find({})
        .project({UID: 1, name: 1, _id: 0})
        .toArray(function(err, docs) {
            //assert.equal(err, null)
            console.log("Found the following records")
            console.log(docs)
            callback(docs)
          })
}
      
  
app.get('/', function (req, res) {
    res.send('hello world')
})

app.listen(3000, () => {
 console.log("Server running on port 3000")
})