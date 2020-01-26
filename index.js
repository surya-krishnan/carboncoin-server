let express = require("express")
let fs = require("fs")
let jwt = require("jsonwebtoken")
let app = express()
app.use(express.json())

let mongo = require('mongodb')
const MongoClient = mongo.MongoClient
const uri = "mongodb+srv://api:soorya@carboncoin-9pa4g.gcp.mongodb.net/test?retryWrites=true&w=majority"
const dbName = "CarbonCoinDev"
const client = new MongoClient(uri, {useNewUrlParser: true, useUnifiedTopology: true});
const key = fs.readFileSync('dev.key')

// ****************************************************************************
// Token validation middleware
app.use(function (req, res, next) {
    console.log((req.method === "GET" && req.url === "/auth") || (req.method === "POST" && req.url === "/users"))
    if ((req.method === "GET" && req.url === "/auth") || (req.method === "POST" && req.url === "/users")) {
        next()
    } else {
        try {
            jwt.verify(req.headers.auth, key)
            next()
        } catch (err) {
            res.status(403).send()
        }
    }
})


// Start the MongoClient session

client.connect(function () {
    client.db(dbName)
})

// ****************************************************************************
// Balance

function getUserBalance(db, _id, callback) {
    let users = db.collection('users')
    let idObject = new mongo.ObjectID(_id)

    users
        .find({_id: idObject})
        .project({balance: 1, ccbalance: 1, _id: 0})
        .toArray(function (err, docs) {
            console.log(docs)
            callback(docs[0])
        })
}

app.get('/balance', function (req, res) {
    //console.log("Querying " + req.params.username + '\'s balance.')
    //console.log("password: " + req.body.pass)
    const db = client.db(dbName);

    getUserBalance(db, jwt.verify(req.headers.auth, key)._id, function (balance) {
        res.send(balance)
    })
})

// ****************************************************************************
// Transactions

function getUserID(db, username, callback) {
    const users = db.collection('users')

    users
        .find({name: username})
        .project({_id: 1})
        .toArray(function (err, docs) {
            callback(docs[0]._id)
        })
}

function logTransaction(db, senderID, recipientID, ccTransfer, cashTransfer, callback) {
    const transactions = db.collection('transactions')
    const users = db.collection('users')

    getUserBalance(db, senderID, function (senderBalance) {
        let senderCashBalance = senderBalance.balance

        if (cashTransfer > senderCashBalance) {
            callback(418)
        } else {
            callback(200)

            transactions
                .insertOne({
                    sender: senderID,
                    recipient: recipientID,
                    cashtransfer: cashTransfer,
                    cctransfer: ccTransfer
                })
            users.updateOne({_id: senderID}, {
                $inc: {
                    balance: -cashTransfer,
                    ccbalance: ccTransfer
                }
            })
            users.updateOne({_id: recipientID}, {
                $inc: {
                    balance: cashTransfer,
                    ccbalance: -ccTransfer
                }
            })
        }
    })
}

app.post('/transactions', function (req, res) {
    let db = client.db(dbName)
    let senderID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)
    let recipientID = new mongo.ObjectID(req.body.recipientID)

    logTransaction(db, senderID, recipientID, req.body.cc, req.body.cash, function (tf) {
        res.status(tf).send()
    })
})

function getUserTransactions(db, id, callback) {
    const trnsactn = db.collection('transactions')

    trnsactn
        .find({
            $or: [
                {sender: id},
                {recipient: id}
            ]
        })
        .project({sender: 1, recipient: 1, cashtransfer: 1, cctransfer: 1, _id: 1})
        .toArray(function (err, docs) {
            console.log(docs)
            callback(docs)
        })
}

app.get('/transactions', function (req, res) {
    console.log("Querying " + req.body.username + "\'s balance.")
    const db = client.db(dbName)
    let userID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)

    getUserTransactions(db, userID, function (transactions) {
        res.send(transactions)
    })
})

// ****************************************************************************
// Create/Delete Users

function createNewUser(db, username, password, callback) {
    const users = db.collection('users')

    users.insertOne({
        name: username,
        pass: password,
        ccbalance: 0.0,
        balance: 0.0
    }, {}, function (err, docs) {
        console.log(docs.ops[0])
        callback(docs.ops[0]._id)
    })
}

app.post('/users', function (req, res) {
    console.log("Creating a new user: " + req.body.username)

    const db = client.db(dbName)

    createNewUser(db, req.body.username, req.body.password, function (newUID) {
        res.status(200).send(newUID)
    })
})

function deleteUser(db, uid, callback) {
    const users = db.collection('users')

    users.deleteOne({
            _id: uid
        },
        {}, function (err, docs) {
            callback()
        })
}

app.delete('/users', function (req, res) {
    console.log("Deleting user: " + req.body.username)

    const db = client.db(dbName)
    let uid = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)

    deleteUser(db, uid, function () {
        res.status(200).send()
    })
})

// ****************************************************************************

function authenticateUser(db, username, password, callback) {
    const users = db.collection('users')

    users
        .find({name: username, pass: password})
        .project({_id: 1})
        .toArray(function (err, docs) {
            if (docs.length >= 1) {
                console.log(docs[0])
                callback(true, docs[0]._id)
            } else {
                callback(false)
            }
        })
}

app.get('/auth', function (req, res) {
    console.log(req.body)
    console.log("Authenticating " + req.body.username + " with password: " + req.body.password)

    const db = client.db(dbName);

    authenticateUser(db, req.body.username, req.body.password, function (authenticated, authenticatedUserID) {
        if (authenticated) {
            res.status(200).send(jwt.sign({_id: authenticatedUserID}, key))
        } else {
            res.status(403).send()
            console.log("Failed")
        }
    })
})

// ****************************************************************************
app.listen(3000, () => {
    console.log("Server running on port 3000")
})