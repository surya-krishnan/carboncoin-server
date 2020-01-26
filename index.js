var express = require("express")
var app = express()
app.use(express.json())

const MongoClient = require('mongodb').MongoClient
const uri = "mongodb+srv://api:soorya@carboncoin-9pa4g.gcp.mongodb.net/test?retryWrites=true&w=majority"
const dbName = "CarbonCoinDev"
const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});


function getUserBalance(db, user, pass, callback) {
    const collection = db.collection('users')

    collection
        .find({name: user, pass: pass})
        .project({balance: 1, ccBalance: 1, _id: 0})
        .toArray(function (err, docs) {
            callback(db, docs)
        })
}


app.get('/users/:username/balance', function (req, res) {

    client.connect(function (err, client) {
        console.log("Connected correctly to server");

        const db = client.db(dbName);

        getUserBalance(db, req.params.username, req.body.pass, function (db, balance) {
            res.send(balance[0])
            client.close()
        })
    });
})


app.listen(3000, () => {
    console.log("Server running on port 3000")
})