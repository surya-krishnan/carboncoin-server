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

    console.log("\n\nIncoming " + req.method + " query on " + req.url)
    if ((req.method === "GET" && req.url === "/auth") || (req.method === "POST" && req.url === "/users")) {
        console.log("\tSkipped token validation.")
        next()
    } else {
        try {
            console.log("\tValidating token:")
            jwt.verify(req.headers.auth, key)
            console.log("\t\tSuccess")
            next()
        } catch (err) {
            console.log("\t\tFailure")
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

function getUserBalance(db, userID, callback) {
    let users = db.collection('users')

    users
        .find({_id: userID})
        .project({balance: 1, ccbalance: 1, _id: 0})
        .toArray(function (err, docs) {
            callback(docs[0])
        })
}

app.get('/balance', function (req, res) {
    const db = client.db(dbName);
    let userID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)

    console.log("\tQuerying " + userID + '\'s balance.')
    getUserBalance(db, userID, function (balance) {
        res.send(balance)
    })
})

// ****************************************************************************
// Transactions

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

    console.log("\tLogging transaction between sender " + senderID + " and recipient " + recipientID)
    logTransaction(db, senderID, recipientID, req.body.cc, req.body.cash, function (tf) {
        res.status(tf).send()
    })
})

function getUserTransactions(db, id, callback) {
    const transactions = db.collection('transactions')

    transactions
        .find({
            $or: [
                {sender: id},
                {recipient: id}
            ]
        })
        .project({sender: 1, recipient: 1, cashtransfer: 1, cctransfer: 1, _id: 1})
        .toArray(function (err, docs) {
            callback(docs)
        })
}

app.get('/transactions', function (req, res) {
    const db = client.db(dbName)
    let userID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)

    console.log("\tGetting " + userID + "\'s transactions.")
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
        callback(docs.ops[0]._id)
    })
}

app.post('/users', function (req, res) {
    console.log("\tCreating new user " + req.body.username)

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
    const db = client.db(dbName)
    let userID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)

    console.log("\tDeleting user " + userID)
    deleteUser(db, userID, function (err) {
        console.log("\t\tSuccess")
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
                callback(true, docs[0]._id)
            } else {
                callback(false)
            }
        })
}

app.get('/auth', function (req, res) {
    console.log("\tAuthenticating " + req.body.username + " with password " + req.body.password)

    const db = client.db(dbName);

    authenticateUser(db, req.body.username, req.body.password, function (authenticated, authenticatedUserID) {
        if (authenticated) {
            console.log("\t\tSuccess")
            res.status(200).send(jwt.sign({_id: authenticatedUserID}, key))
        } else {
            res.status(403).send()
            console.log("\t\tFailure")
        }
    })
})

// ****************************************************************************
app.listen(3000, () => {
    console.log("Server running on port 3000")
})