let express = require("express")
let app = express()
app.use(express.json())

const MongoClient = require('mongodb').MongoClient
const uri = "mongodb+srv://api:soorya@carboncoin-9pa4g.gcp.mongodb.net/test?retryWrites=true&w=majority"
const dbName = "CarbonCoinDev"
const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});


client.connect(function (err, client) {
    const db = client.db(dbName)
    const collection = db.collection('users')

    collection
        .find({name: 'philnic'})
        .project({_id: 1})
        .toArray(function (err, docs) {
            console.log(docs)
            console.log(docs[0])
            // client.close(false, console.log("closed first client"))
        })
})

function getUserBalance(db, user, pass, callback) {
    const users = db.collection('users')

    users
        .find({name: user, pass: pass})
        .project({balance: 1, ccbalance: 1, _id: 0})
        .toArray(function (err, docs) {
            console.log(docs)
            callback(docs)
        })
}

function getUserTransactions(db,id, callback) {
    const trnsactn = db.collection('transactions')

    trnsactn
        .find({
            $or:[
            {sender: id},
            {recipient: id}
            ]})
        .project({sender: 1, recipient: 1, cashtransfer: 1, cctransfer: 1, _id: 0})
        .toArray(function (err, docs) {
            console.log(docs)
            callback(docs)
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

function authenticateUser(db, username, password, callback) {
    const users = db.collection('users')

    users
        .find({name: username, pass: password})
        .project({_id: 1})
        .toArray(function (err, docs) {
            console.log(docs.length)
            callback(docs.length === 1)
        })
}

app.post('/users/:username', function (req, res) {
    client.connect(function (err, client) {
        console.log("Creating a new user: " + req.params.username)

        const db = client.db(dbName)

        createNewUser(db, req.params.username, req.body.pass, function () {
            res.status(200).send()
            client.close()
        })
    })
})


app.get('/users/:username/balance', function (req, res) {
    client.connect(function (err, client) {
        console.log("Querying " + req.params.username + '\'s balance.')

        const db = client.db(dbName);

        getUserBalance(db, req.params.username, req.body.pass, function (balance) {
            res.send(balance[0])
            client.close()
        })
    });
})

app.get('/users/:username/transactions', function (req, res) {
    client.connect(function (err, client) {
        console.log("Querying " + req.params.username + "'s balance.")
        const db = client.db(dbName)
        getUserTransactions(db,req.params.username, function (transactions) {
            res.send(transactions)
            client.close()
        })
    })
})
app.get('/auth/user/:username', function (req, res) {
    client.connect(function (err, client) {
        console.log("Authenticating " + req.params.username)

        const db = client.db(dbName);

        authenticateUser(db, req.params.username, req.body.pass, function (authenticated) {
            if (authenticated) {
                res.status(200).send()
            } else {
                res.status(403).send()
            }

            client.close()
        })
    })
})


app.listen(3000, () => {
    console.log("Server running on port 3000")
})