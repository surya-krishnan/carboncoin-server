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
    if ((req.method === "GET" && req.url === "/auth" || req.url.includes("/store/buy/product/")) || (req.method === "POST" && req.url === "/users")) {
        console.log("\tSkipped token validation.")
        next()
    } else {
        try {
            console.log("\tValidating token:")
            console.log(req.headers.auth)
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

function getUserName(db, userID, callback) {
    let users = db.collection('users')
    users
        .find({_id: userID})
        .project({name: 1, _id: 0})
        .toArray(function (err, docs) {
            callback(docs[0].name)
        })
}

// ****************************************************************************
// Balance

function getUserBalance(db, userID, callback) {
    let users = db.collection('users')

    users
        .find({_id: userID})
        .project({balance: 1, carbonBalance: 1, _id: 0})
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

function logTransaction(db, senderID, recipientID, carbonTransfer, cashTransfer, callback) {
    const transactions = db.collection('transactions')
    const users = db.collection('users')

    getUserBalance(db, senderID, function (senderBalance) {
        let senderCashBalance = senderBalance.balance

        if (cashTransfer > senderCashBalance) {
            callback(418)
        } else {
            callback(200)
            getUserName(db, senderID, function (name) {
                getUserName(db, recipientID, function (rName) {
                    transactions
                        .insertOne({
                            sender: senderID,
                            recipient: recipientID,
                            cashTransfer: cashTransfer,
                            carbonTransfer: carbonTransfer,
                            senderName: name,
                            recipientName: rName
                        })
                    users.updateOne({_id: senderID}, {
                        $inc: {
                            balance: -cashTransfer,
                            carbonBalance: carbonTransfer
                        }
                    })
                    users.updateOne({_id: recipientID}, {
                        $inc: {
                            balance: cashTransfer,
                            carbonBalance: -carbonTransfer
                        }
                    })
                })
            })
        }
    })
}

app.post('/transactions', function (req, res) {
    let db = client.db(dbName)
    console.log(req.body)
    console.log('id')
    let senderID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)
    let recipientID = new mongo.ObjectID(req.body.recipientID)

    console.log("\tLogging transaction between sender " + senderID + " and recipient " + recipientID)
    logTransaction(db, senderID, recipientID, req.body.carbon, req.body.cash, function (tf) {
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
        .project({sender: 1, recipient: 1, cashTransfer: 1, carbonTransfer: 1, _id: 1})
        .toArray(function (err, docs) {
            for (i = 0; i < docs.length; i++) {
                docs[i].timestamp = new mongo.ObjectID(docs[i]._id).getTimestamp()
            }
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

function getTransactionsViewable(db, id, callback) {
    const transactions = db.collection('transactions')

    transactions
        .find({
            $or: [
                {sender: id},
                {recipient: id}
            ]
        })
        .project({senderName: 1, recipientName: 1, cashTransfer: 1, carbonTransfer: 1, _id: 1})
        .toArray(function (err, docs) {
            for (i = 0; i < docs.length; i++) {
                docs[i].timestamp = new mongo.ObjectID(docs[i]._id).getTimestamp()
            }
            callback(docs)
        })
}

app.get('/transactions/viewable', function (req, res) {
    const db = client.db(dbName)
    let userID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)
    console.log("\tGetting " + userID + "\'s transactions. Viewable**")
    getTransactionsViewable(db, userID, function (transactions) {
        res.send(transactions)
    })
})

function getProduct(db, productID, callback) {
    const inv = db.collection('inventory')
    inv
        .find({_id: productID})
        .project({leftInStock: 1, carbonCost: 1, cashCost: 1, _id: 0})
        .toArray(function (err, docs) {
            callback(docs[0])
        })
}

function buyProduct(db, senderID, productID, callback) {
    const storeID = new mongo.ObjectID('5e2d6ebc1c9d4400009ea284')
    const inventory = db.collection('inventory')
    let idObject = new mongo.ObjectID(productID)

    getProduct(db, idObject, function (prod) {
        console.log(prod.carbonCost)
        console.log(prod.leftInStock)
        if (prod.leftInStock >= 1) {
            inventory
                .updateOne({_id: idObject},
                    {$inc: {leftInStock: -1}})
            logTransaction(db, senderID, storeID, prod.carbonCost, prod.cashCost, function (code) {
                callback(code)
            })
        } else {
            callback(418)
        }
    })
}

function getInventory(db, callback) {
    const inventory = db.collection('inventory')

    inventory
        .find({})
        .project({name: 1, carbonCost: 1, cashCost: 1, leftInStock: 1, _id: 1})
        .toArray(function (err, docs) {
            callback(docs)
        })
}

app.get('/store/inventory', function (req, res) {
    const db = client.db(dbName)
    console.log("\tGetting inventory**")
    getInventory(db, function (inv) {
        res.send(inv)
    })
})

app.get('/store/product/:productID', function (req, res) {
    let db = client.db(dbName)
    let senderID = new mongo.ObjectID(jwt.verify(req.headers.auth, key)._id)
    buyProduct(db, senderID, req.params.productID, function (code) {
        res.status(code).send()
    })
})

app.get('/store/buy/product/:productID?', function (req, res) {
    let db = client.db(dbName)
    console.log(req.query)
    let token = req.query.t.replace(/_/g, ".")
    let senderID = new mongo.ObjectID(jwt.verify(token, key)._id)
    buyProduct(db, senderID, req.params.productID, function (code) {
        res.status(code).send()
    })
})

function restockProduct(db, productID, amount, callback) {
    const inv = db.collection('inventory')
    inv
        .updateOne({_id: productID},
            {$inc: {leftInStock: amount}})
    callback(200)
}

app.post('/store/product/:productID', function (req, res) {
    let db = client.db(dbName)
    let idObject = new mongo.ObjectID(req.params.productID)
    restockProduct(db, idObject, req.body.amount, function (code) {
        res.status(code).send()
    })
})

// ****************************************************************************
// Create/Delete Users

function createNewUser(db, username, password, callback) {
    const users = db.collection('users')

    users.insertOne({
        name: username,
        pass: password,
        carbonBalance: 0.0,
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