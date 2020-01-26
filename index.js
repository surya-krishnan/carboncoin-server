let express = require("express")
let app = express()
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

function createNewUser(db, username, password, callback) {
    const users = db.collection('users')

    users.insertOne({
        name: username,
        pass: password,
        ccbalance: 0.0,
        balance: 0.0
    }, {}, function (err, docs) {
        callback()
    })
}

app.post('/users/:username', function (req, res) {
    client.connect(function (err, client) {
        console.log("Creating a new user: " + req.params.username)

        const db = client.db(dbName);

        createNewUser(db, req.params.username, req.body.pass, function () {
            res.status(200).send()
            client.close()
        })
    })
})

app.get('/users/:username/balance', function (req, res) {
    client.connect(function (err, client) {
        console.log("Querying " + req.params.username + '\'s balance.');

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